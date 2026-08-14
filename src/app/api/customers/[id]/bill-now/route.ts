import { NextRequest, NextResponse } from "next/server";
import { readData, updateData, generateBillId, getActiveTariffId, saveBillPDFToFile } from "@/lib/db";
import { calculateBillCharges } from "@/lib/billing";
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

    const charges = calculateBillCharges(
      tariff, openingReading, closingReading, billingPeriodStart, billingPeriodEnd,
    );

    const generatedAt = new Date();
    const bill: Bill = {
      id: generateBillId(customer.accountNumber, meter.serialNumber, generatedAt, data.bills.map(b => b.id)),
      customerId: id,
      meterId: meter.id,
      tariffRateId: tariff.id,
      billingPeriodStart,
      billingPeriodEnd,
      openingReadingId: openingReading.id,
      closingReadingId: closingReading.id,
      tariff1Usage: charges.tariff1Usage,
      tariff2Usage: charges.tariff2Usage,
      ...(charges.tariff3Usage !== undefined && { tariff3Usage: charges.tariff3Usage, tariff3Cost: charges.tariff3Cost }),
      ...(charges.tariff4Usage !== undefined && { tariff4Usage: charges.tariff4Usage, tariff4Cost: charges.tariff4Cost }),
      tariff1Cost: charges.tariff1Cost,
      tariff2Cost: charges.tariff2Cost,
      standingCharge: charges.standingCharge,
      subtotal: charges.subtotal,
      vat: charges.vat,
      total: charges.total,
      status: "draft",
      generatedAt: generatedAt.toISOString(),
    };

    // Claim the bill ID and record it before the PDF work, so a PDF failure cannot lose the bill.
    updateData((fresh) => {
      bill.id = generateBillId(customer.accountNumber, meter.serialNumber, generatedAt, fresh.bills.map(b => b.id));
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
    });

    // Generate PDF
    try {
      const pdfBytes = await generateBillPDF(bill, customer, tariff, data.branding, openingReading, closingReading, meter);
      const storagePath = data.schedulerSettings.pdfStoragePath;
      if (storagePath) {
        bill.pdfFilePath = saveBillPDFToFile(bill.id, pdfBytes, storagePath);
      } else {
        bill.pdfBase64 = Buffer.from(pdfBytes).toString("base64");
      }
      updateData((fresh) => {
        const idx = fresh.bills.findIndex((b) => b.id === bill.id);
        if (idx >= 0) fresh.bills[idx] = bill;
      });
    } catch (err) {
      console.error(`bill-now PDF error for ${meter.name}:`, err);
      results.push({ meter: meter.name, billId: bill.id, error: "Bill saved but PDF generation failed" });
      continue;
    }

    results.push({ meter: meter.name, billId: bill.id });
  }

  const generated = results.filter((r) => r.billId).length;
  const failed = results.filter((r) => r.error).length;

  return NextResponse.json({ results, generated, failed });
}
