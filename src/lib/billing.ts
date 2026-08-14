import { generateBillId } from "./db";
import { toDateOnly } from "./format";
import type { AppData, Bill, Customer, Meter, MeterReading, TariffRate } from "./types";

export interface BillCharges {
  tariff1Usage: number;
  tariff2Usage: number;
  tariff3Usage: number;
  tariff4Usage: number;
  tariff1Cost: number;
  tariff2Cost: number;
  tariff3Cost: number;
  tariff4Cost: number;
  billingDays: number;
  standingCharge: number;
  subtotal: number;
  vat: number;
  total: number;
}

/** Whole days between two YYYY-MM-DD dates, rounded up. */
export function calculateBillingDays(billingPeriodStart: string, billingPeriodEnd: string): number {
  return Math.ceil(
    (new Date(billingPeriodEnd).getTime() - new Date(billingPeriodStart).getTime()) /
      (1000 * 60 * 60 * 24),
  );
}

/** Usage, costs, standing charge, VAT and total for one billing period.
 *  Tariffs 2-4 only contribute when enabled on the tariff rate. */
export function calculateBillCharges(
  tariff: TariffRate,
  openingReading: MeterReading,
  closingReading: MeterReading,
  billingPeriodStart: string,
  billingPeriodEnd: string,
): BillCharges {
  const tariff1Usage = Math.max(0, closingReading.tariff1Kwh - openingReading.tariff1Kwh);
  const tariff2Usage = tariff.tariff2Enabled !== false
    ? Math.max(0, closingReading.tariff2Kwh - openingReading.tariff2Kwh)
    : 0;
  const tariff3Usage = tariff.tariff3Enabled
    ? Math.max(0, (closingReading.tariff3Kwh ?? 0) - (openingReading.tariff3Kwh ?? 0))
    : 0;
  const tariff4Usage = tariff.tariff4Enabled
    ? Math.max(0, (closingReading.tariff4Kwh ?? 0) - (openingReading.tariff4Kwh ?? 0))
    : 0;

  const tariff1Cost = tariff1Usage * tariff.tariff1RatePerKwh;
  const tariff2Cost = tariff2Usage * tariff.tariff2RatePerKwh;
  const tariff3Cost = tariff3Usage * (tariff.tariff3RatePerKwh ?? 0);
  const tariff4Cost = tariff4Usage * (tariff.tariff4RatePerKwh ?? 0);

  const billingDays = calculateBillingDays(billingPeriodStart, billingPeriodEnd);
  const standingCharge = billingDays * tariff.standingChargePerDay;

  const subtotal = tariff1Cost + tariff2Cost + tariff3Cost + tariff4Cost + standingCharge;
  const vat = subtotal * (tariff.vatRate / 100);
  const total = subtotal + vat;

  return {
    tariff1Usage, tariff2Usage, tariff3Usage, tariff4Usage,
    tariff1Cost, tariff2Cost, tariff3Cost, tariff4Cost,
    billingDays, standingCharge, subtotal, vat, total,
  };
}

export interface BuildBillInput {
  customer: Customer;
  tariff: TariffRate;
  meter?: Meter;
  openingReading: MeterReading;
  closingReading: MeterReading;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  generatedAt?: Date;
}

/** Builds a draft Bill (id, period, usage, costs, totals) for one meter/customer period. */
export function buildBill(input: BuildBillInput): Bill {
  const { customer, tariff, meter, openingReading, closingReading, billingPeriodStart, billingPeriodEnd } = input;
  const generatedAt = input.generatedAt ?? new Date();
  const charges = calculateBillCharges(tariff, openingReading, closingReading, billingPeriodStart, billingPeriodEnd);

  return {
    id: generateBillId(customer.accountNumber, meter?.serialNumber, generatedAt),
    customerId: customer.id,
    ...(meter && { meterId: meter.id }),
    tariffRateId: tariff.id,
    billingPeriodStart,
    billingPeriodEnd,
    openingReadingId: openingReading.id,
    closingReadingId: closingReading.id,
    tariff1Usage: charges.tariff1Usage,
    tariff2Usage: charges.tariff2Usage,
    ...(tariff.tariff3Enabled && { tariff3Usage: charges.tariff3Usage, tariff3Cost: charges.tariff3Cost }),
    ...(tariff.tariff4Enabled && { tariff4Usage: charges.tariff4Usage, tariff4Cost: charges.tariff4Cost }),
    tariff1Cost: charges.tariff1Cost,
    tariff2Cost: charges.tariff2Cost,
    standingCharge: charges.standingCharge,
    subtotal: charges.subtotal,
    vat: charges.vat,
    total: charges.total,
    status: "draft",
    generatedAt: generatedAt.toISOString(),
  };
}

export type BillingWindow = {
  openingReading: MeterReading;
  closingReading: MeterReading;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  /** True when no reading was taken since the last bill, so only standing charge applies. */
  standingChargeOnly: boolean;
};

/** Determines the period to bill for a meter: from the previous bill's closing reading
 *  (or the first reading ever) to the latest reading. When no new reading exists, the
 *  period runs to `todayStr` and covers standing charge only.
 *  Returns an error message instead of a window when the meter cannot be billed. */
export function resolveMeterBillingWindow(
  meterId: string,
  customerId: string,
  data: AppData,
  todayStr: string,
): BillingWindow | { error: string } {
  const meterReadings = data.meterReadings
    .filter((r) => r.meterId === meterId)
    .sort((a, b) => a.readingDate.localeCompare(b.readingDate));

  if (meterReadings.length === 0) return { error: "No readings available" };

  const latestBill = data.bills
    .filter((b) => b.customerId === customerId && b.meterId === meterId)
    .sort((a, b) => b.billingPeriodEnd.localeCompare(a.billingPeriodEnd))[0];

  const openingReading = latestBill
    ? (data.meterReadings.find((r) => r.id === latestBill.closingReadingId) ?? meterReadings[0])
    : meterReadings[0];
  const closingReading = meterReadings[meterReadings.length - 1];

  if (openingReading.id === closingReading.id) {
    const billingPeriodStart = latestBill?.billingPeriodEnd ?? toDateOnly(openingReading.readingDate);
    if (billingPeriodStart >= todayStr) {
      return { error: "No new reading and billing period is 0 days" };
    }
    return {
      openingReading,
      closingReading,
      billingPeriodStart,
      billingPeriodEnd: todayStr,
      standingChargeOnly: true,
    };
  }

  return {
    openingReading,
    closingReading,
    billingPeriodStart: toDateOnly(openingReading.readingDate),
    billingPeriodEnd: toDateOnly(closingReading.readingDate),
    standingChargeOnly: false,
  };
}

/** Tags every reading in the bill's scope and date range with the bill id. */
export function markReadingsBilled(
  readings: MeterReading[],
  bill: Bill,
  openingDate: string,
  closingDate: string,
): MeterReading[] {
  return readings.map((r) => {
    const sameScope = bill.meterId ? r.meterId === bill.meterId : r.customerId === bill.customerId;
    if (!sameScope) return r;
    if (r.readingDate < openingDate || r.readingDate > closingDate) return r;
    return { ...r, billedInBillId: bill.id };
  });
}
