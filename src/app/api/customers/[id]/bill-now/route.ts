import { NextRequest, NextResponse } from "next/server";
import { readData, writeData, generateBillId, getActiveTariffId, saveBillPDFToFile } from "@/lib/db";
import { generateBillPDF } from "@/lib/pdf-generator";
import type { Bill } from "@/lib/types";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();

  const customer = data.customers.find((c) => c.id === id);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const customerMeters = data.meters.filter((m) => m.customerId === id);
  if (customerMeters.length === 0) {
    return NextResponse.json({ error: "No meters configured for this customer" }, { status: 400 });
  }

  const results: { meter: string; billId?: string; error?: string }[] = [];

  for (const meter of customerMeters) {
    const meterReadings = data.meterReadings
      .filter((r) => r.meterId === meter.id)
      .sort((a, b) => a.readingDate.localeCompare(b.readingDate));

    if (meterReadings.length === 0) {
      results.push({ meter: meter.name, error: "No readings available" });
      continue;
    }

    const latestBill = data.bills
      .filter((b) => b.customerId === id && b.meterId === meter.id)
      .sort((a, b) => b.billingPeriodEnd.localeCompare(a.billingPeriodEnd))[0];

    const openingReading = latestBill
      ? (data.meterReadings.find((r) => r.id === latestBill.closingReadingId) ?? meterReadings[0])
      : meterReadings[0];

    const closingReading = meterReadings[meterReadings.length - 1];

    const today = new Date().toISOString().substring(0, 10);
    let billingPeriodStart: string;
    let billingPeriodEnd: string;

    if (openingReading.id === closingReading.id) {
      // No new reading — bill for standing charge up to today
      billingPeriodStart = latestBill?.billingPeriodEnd ?? openingReading.readingDate.substring(0, 10);
      billingPeriodEnd = today;
      if (billingPeriodStart >= billingPeriodEnd) {
        results.push({ meter: meter.name, error: "No new reading and billing period is 0 days" });
        continue;
      }
    } else {
      billingPeriodStart = openingReading.readingDate.substring(0, 10);
      billingPeriodEnd = closingReading.readingDate.substring(0, 10);
    }

    const activeTariffId = getActiveTariffId(id, billingPeriodStart, data);
    const tariff = activeTariffId ? data.tariffRates.find((t) => t.id === activeTariffId) : undefined;
    if (!tariff) {
      results.push({ meter: meter.name, error: "No tariff plan assigned" });
      continue;
    }

    const tariff1Usage = Math.max(0, closingReading.tariff1Kwh - openingReading.tariff1Kwh);
    const tariff2Usage = tariff.tariff2Enabled !== false
      ? Math.max(0, closingReading.tariff2Kwh - openingReading.tariff2Kwh)
      : 0;
    const tariff1Cost = tariff1Usage * tariff.tariff1RatePerKwh;
    const tariff2Cost = tariff2Usage * tariff.tariff2RatePerKwh;

    const billingDays = Math.ceil(
      (new Date(billingPeriodEnd).getTime() - new Date(billingPeriodStart).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    const standingCharge = billingDays * tariff.standingChargePerDay;
    const subtotal = tariff1Cost + tariff2Cost + standingCharge;
    const vat = subtotal * (tariff.vatRate / 100);
    const total = subtotal + vat;

    const generatedAt = new Date();
    const bill: Bill = {
      id: generateBillId(customer.accountNumber, meter.serialNumber, generatedAt),
      customerId: id,
      meterId: meter.id,
      tariffRateId: tariff.id,
      billingPeriodStart,
      billingPeriodEnd,
      openingReadingId: openingReading.id,
      closingReadingId: closingReading.id,
      tariff1Usage,
      tariff2Usage,
      tariff1Cost,
      tariff2Cost,
      standingCharge,
      subtotal,
      vat,
      total,
      status: "draft",
      generatedAt: generatedAt.toISOString(),
    };

    // Generate PDF
    try {
      const pdfBytes = await generateBillPDF(bill, customer, tariff, data.branding, openingReading, closingReading, meter);
      const storagePath = data.schedulerSettings.pdfStoragePath;
      if (storagePath) {
        bill.pdfFilePath = saveBillPDFToFile(bill.id, pdfBytes, storagePath);
      } else {
        bill.pdfBase64 = Buffer.from(pdfBytes).toString("base64");
      }
    } catch (err) {
      console.error(`bill-now PDF error for ${meter.name}:`, err);
    }

    // Save bill + mark readings as billed + update lastAutoBilledAt
    const fresh = readData();
    fresh.bills.push(bill);
    fresh.meterReadings = fresh.meterReadings.map((r) => {
      if (r.meterId !== meter.id) return r;
      if (r.readingDate < openingReading.readingDate || r.readingDate > closingReading.readingDate) return r;
      return { ...r, billedInBillId: bill.id };
    });
    const custIdx = fresh.customers.findIndex((c) => c.id === id);
    if (custIdx >= 0) {
      fresh.customers[custIdx] = {
        ...fresh.customers[custIdx],
        lastAutoBilledAt: new Date().toISOString().substring(0, 10),
      };
    }
    writeData(fresh);

    results.push({ meter: meter.name, billId: bill.id });
  }

  const generated = results.filter((r) => r.billId).length;
  const failed = results.filter((r) => r.error).length;

  return NextResponse.json({ results, generated, failed });
}
