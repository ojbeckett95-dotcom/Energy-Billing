import type { MeterReading, TariffRate } from "./types";

/** The monetary part of a bill, shared by manual billing, "bill now" and the scheduler. */
export interface BillCharges {
  tariff1Usage: number;
  tariff2Usage: number;
  tariff3Usage?: number;
  tariff4Usage?: number;
  tariff1Cost: number;
  tariff2Cost: number;
  tariff3Cost?: number;
  tariff4Cost?: number;
  billingDays: number;
  standingCharge: number;
  subtotal: number;
  vat: number;
  total: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Whole days between two YYYY-MM-DD dates, never negative. */
export function billingDaysBetween(periodStart: string, periodEnd: string): number {
  const start = new Date(periodStart).getTime();
  const end = new Date(periodEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - start) / MS_PER_DAY));
}

export function calculateBillCharges(
  tariff: TariffRate,
  opening: Pick<MeterReading, "tariff1Kwh" | "tariff2Kwh" | "tariff3Kwh" | "tariff4Kwh">,
  closing: Pick<MeterReading, "tariff1Kwh" | "tariff2Kwh" | "tariff3Kwh" | "tariff4Kwh">,
  periodStart: string,
  periodEnd: string,
): BillCharges {
  const tariff1Usage = Math.max(0, closing.tariff1Kwh - opening.tariff1Kwh);
  const tariff2Usage = tariff.tariff2Enabled !== false
    ? Math.max(0, closing.tariff2Kwh - opening.tariff2Kwh)
    : 0;
  const tariff3Usage = tariff.tariff3Enabled
    ? Math.max(0, (closing.tariff3Kwh ?? 0) - (opening.tariff3Kwh ?? 0))
    : 0;
  const tariff4Usage = tariff.tariff4Enabled
    ? Math.max(0, (closing.tariff4Kwh ?? 0) - (opening.tariff4Kwh ?? 0))
    : 0;

  const tariff1Cost = tariff1Usage * tariff.tariff1RatePerKwh;
  const tariff2Cost = tariff2Usage * tariff.tariff2RatePerKwh;
  const tariff3Cost = tariff3Usage * (tariff.tariff3RatePerKwh ?? 0);
  const tariff4Cost = tariff4Usage * (tariff.tariff4RatePerKwh ?? 0);

  const billingDays = billingDaysBetween(periodStart, periodEnd);
  const standingCharge = billingDays * tariff.standingChargePerDay;

  const subtotal = tariff1Cost + tariff2Cost + tariff3Cost + tariff4Cost + standingCharge;
  const vat = subtotal * (tariff.vatRate / 100);

  return {
    tariff1Usage,
    tariff2Usage,
    ...(tariff.tariff3Enabled && { tariff3Usage, tariff3Cost }),
    ...(tariff.tariff4Enabled && { tariff4Usage, tariff4Cost }),
    tariff1Cost,
    tariff2Cost,
    billingDays,
    standingCharge,
    subtotal,
    vat,
    total: subtotal + vat,
  };
}
