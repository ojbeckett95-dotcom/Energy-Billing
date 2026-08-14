import { NextRequest, NextResponse } from "next/server";
import { readData, writeData, getActiveTariffId } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api-response";
import { buildBill, markReadingsBilled, resolveMeterBillingWindow } from "@/lib/billing";
import { renderAndAttachBillPDF } from "@/lib/bill-pdf";
import { todayDateOnly } from "@/lib/format";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();

  const customer = data.customers.find((c) => c.id === id);
  if (!customer) return notFound("Customer not found");

  const customerMeters = data.meters.filter((m) => m.customerId === id);
  if (customerMeters.length === 0) {
    return badRequest("No meters configured for this customer");
  }

  const today = todayDateOnly();
  const results: { meter: string; billId?: string; error?: string }[] = [];

  for (const meter of customerMeters) {
    const window = resolveMeterBillingWindow(meter.id, id, data, today);
    if ("error" in window) {
      results.push({ meter: meter.name, error: window.error });
      continue;
    }
    const { openingReading, closingReading, billingPeriodStart, billingPeriodEnd } = window;

    const activeTariffId = getActiveTariffId(id, billingPeriodStart, data);
    const tariff = activeTariffId ? data.tariffRates.find((t) => t.id === activeTariffId) : undefined;
    if (!tariff) {
      results.push({ meter: meter.name, error: "No tariff plan assigned" });
      continue;
    }

    const bill = buildBill({
      customer, tariff, meter, openingReading, closingReading, billingPeriodStart, billingPeriodEnd,
    });

    await renderAndAttachBillPDF(
      bill, customer, tariff, data.branding, openingReading, closingReading, meter,
      data.schedulerSettings.pdfStoragePath, `bill-now ${meter.name}`,
    );

    // Save bill + mark readings as billed + update lastAutoBilledAt
    const fresh = readData();
    fresh.bills.push(bill);
    fresh.meterReadings = markReadingsBilled(
      fresh.meterReadings, bill, openingReading.readingDate, closingReading.readingDate,
    );
    const custIdx = fresh.customers.findIndex((c) => c.id === id);
    if (custIdx >= 0) {
      fresh.customers[custIdx] = { ...fresh.customers[custIdx], lastAutoBilledAt: today };
    }
    writeData(fresh);

    results.push({ meter: meter.name, billId: bill.id });
  }

  const generated = results.filter((r) => r.billId).length;
  const failed = results.filter((r) => r.error).length;

  return NextResponse.json({ results, generated, failed });
}
