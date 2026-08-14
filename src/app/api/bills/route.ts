import { withErrorHandling } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { readData, writeData, generateBillId, saveBillPDFToFile } from "@/lib/db";
import { generateBillPDF } from "@/lib/pdf-generator";
import type { Bill } from "@/lib/types";

interface GenerateBillRequest {
  customerId: string;
  meterId?: string;
  tariffRateId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  openingReadingId: string;
  closingReadingId: string;
}

// DELETE /api/bills — bulk delete by IDs
export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json() as { ids: string[] };
  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }
  const data = readData();
  const idSet = new Set(ids);

  // Delete PDF files from disk for any bills that have them
  for (const bill of data.bills) {
    if (!idSet.has(bill.id)) continue;
    if (bill.pdfFilePath) {
      try {
        const fs = await import("fs");
        if (fs.existsSync(bill.pdfFilePath)) fs.unlinkSync(bill.pdfFilePath);
      } catch (err) {
        console.error(`Could not delete PDF ${bill.pdfFilePath}:`, err);
      }
    }
  }

  // Clear billedInBillId from readings referencing any of these bills
  data.meterReadings = data.meterReadings.map((r) => {
    if (!r.billedInBillId || !idSet.has(r.billedInBillId)) return r;
    const { billedInBillId: _, ...rest } = r;
    return rest;
  });

  data.bills = data.bills.filter(b => !idSet.has(b.id));
  writeData(data);
  return NextResponse.json({ success: true, deleted: ids.length });
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");
  const data = readData();
  const bills = customerId
    ? data.bills.filter((b) => b.customerId === customerId)
    : data.bills;
  return NextResponse.json(bills.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)));
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json() as GenerateBillRequest;
  const data = readData();

  const customer = data.customers.find((c) => c.id === body.customerId);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const tariff = data.tariffRates.find((t) => t.id === body.tariffRateId);
  if (!tariff) return NextResponse.json({ error: "Tariff not found" }, { status: 404 });

  const openingReading = data.meterReadings.find((r) => r.id === body.openingReadingId);
  if (!openingReading) return NextResponse.json({ error: "Opening reading not found" }, { status: 404 });

  const closingReading = data.meterReadings.find((r) => r.id === body.closingReadingId);
  if (!closingReading) return NextResponse.json({ error: "Closing reading not found" }, { status: 404 });

  // Calculate usage
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

  // Calculate costs
  const tariff1Cost = tariff1Usage * tariff.tariff1RatePerKwh;
  const tariff2Cost = tariff2Usage * tariff.tariff2RatePerKwh;
  const tariff3Cost = tariff3Usage * (tariff.tariff3RatePerKwh ?? 0);
  const tariff4Cost = tariff4Usage * (tariff.tariff4RatePerKwh ?? 0);

  const billingDays = Math.ceil(
    (new Date(body.billingPeriodEnd).getTime() - new Date(body.billingPeriodStart).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const standingCharge = billingDays * tariff.standingChargePerDay;

  const subtotal = tariff1Cost + tariff2Cost + tariff3Cost + tariff4Cost + standingCharge;
  const vat = subtotal * (tariff.vatRate / 100);
  const total = subtotal + vat;

  const meter = body.meterId ? data.meters.find(m => m.id === body.meterId) : undefined;
  const generatedAt = new Date();

  const bill: Bill = {
    id: generateBillId(customer.accountNumber, meter?.serialNumber, generatedAt),
    customerId: body.customerId,
    ...(body.meterId && { meterId: body.meterId }),
    tariffRateId: body.tariffRateId,
    billingPeriodStart: body.billingPeriodStart,
    billingPeriodEnd: body.billingPeriodEnd,
    openingReadingId: body.openingReadingId,
    closingReadingId: body.closingReadingId,
    tariff1Usage,
    tariff2Usage,
    ...(tariff.tariff3Enabled && { tariff3Usage, tariff3Cost }),
    ...(tariff.tariff4Enabled && { tariff4Usage, tariff4Cost }),
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
    console.error("PDF generation failed:", err);
    bill.pdfError = err instanceof Error ? err.message : String(err);
  }

  data.bills.push(bill);

  // Mark ALL readings for this meter (or customer) within the billing period as billed
  const openingDate = openingReading.readingDate;
  const closingDate = closingReading.readingDate;
  data.meterReadings = data.meterReadings.map((r) => {
    const sameScope = body.meterId ? r.meterId === body.meterId : r.customerId === body.customerId;
    if (!sameScope) return r;
    if (r.readingDate < openingDate || r.readingDate > closingDate) return r;
    return { ...r, billedInBillId: bill.id };
  });

  writeData(data);

  return NextResponse.json(bill, { status: 201 });
});
