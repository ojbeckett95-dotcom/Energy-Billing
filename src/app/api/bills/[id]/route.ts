import { withErrorHandling } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { readData, writeData, saveBillPDFToFile } from "@/lib/db";
import { generateBillPDF } from "@/lib/pdf-generator";
import { sendBillEmail } from "@/lib/email";
import fs from "fs";

export const GET = withErrorHandling(async (_: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const data = readData();
  const bill = data.bills.find((b) => b.id === id);
  if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(bill);
});

export const DELETE = withErrorHandling(async (_: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const data = readData();

  // Delete PDF file from disk if it exists
  const bill = data.bills.find((b) => b.id === id);
  if (bill?.pdfFilePath && fs.existsSync(bill.pdfFilePath)) {
    try {
      fs.unlinkSync(bill.pdfFilePath);
    } catch (err) {
      console.error(`Could not delete PDF ${bill.pdfFilePath}:`, err);
    }
  }

  // Clear billedInBillId from all readings that reference this bill
  data.meterReadings = data.meterReadings.map((r) => {
    if (r.billedInBillId !== id) return r;
    const { billedInBillId: _, ...rest } = r;
    return rest;
  });

  data.bills = data.bills.filter((b) => b.id !== id);
  writeData(data);
  return NextResponse.json({ success: true });
});

// PATCH /api/bills/[id] – update status or regenerate PDF
export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json() as { action?: string; status?: string };
  const data = readData();
  const idx = data.bills.findIndex((b) => b.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bill = data.bills[idx];

  if (body.action === "send" || body.action === "resend") {
    // Send email with PDF
    const customer = data.customers.find((c) => c.id === bill.customerId);
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const meter = bill.meterId ? data.meters.find(m => m.id === bill.meterId) : undefined;

    let pdfBytes: Uint8Array;
    if (bill.pdfFilePath && fs.existsSync(bill.pdfFilePath)) {
      pdfBytes = fs.readFileSync(bill.pdfFilePath);
    } else if (bill.pdfBase64) {
      pdfBytes = Buffer.from(bill.pdfBase64, "base64");
    } else {
      const tariff = data.tariffRates.find((t) => t.id === bill.tariffRateId);
      const openingReading = data.meterReadings.find((r) => r.id === bill.openingReadingId);
      const closingReading = data.meterReadings.find((r) => r.id === bill.closingReadingId);
      if (!tariff || !openingReading || !closingReading) {
        return NextResponse.json({ error: "Missing data for PDF generation" }, { status: 400 });
      }
      pdfBytes = await generateBillPDF(bill, customer, tariff, data.branding, openingReading, closingReading, meter);
    }

    const result = await sendBillEmail(bill, customer, data.branding, data.emailSettings, pdfBytes, meter);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    if (body.action === "send") {
      bill.status = "sent";
    }
    bill.sentAt = new Date().toISOString();
    data.bills[idx] = bill;
    writeData(data);
    return NextResponse.json({ success: true, bill });
  }

  if (body.action === "regenerate-pdf") {
    const tariff = data.tariffRates.find((t) => t.id === bill.tariffRateId);
    const customer = data.customers.find((c) => c.id === bill.customerId);
    const openingReading = data.meterReadings.find((r) => r.id === bill.openingReadingId);
    const closingReading = data.meterReadings.find((r) => r.id === bill.closingReadingId);
    if (!tariff || !customer || !openingReading || !closingReading) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    const meter = bill.meterId ? data.meters.find(m => m.id === bill.meterId) : undefined;
    const pdfBytes = await generateBillPDF(bill, customer, tariff, data.branding, openingReading, closingReading, meter);
    const storagePath = data.schedulerSettings.pdfStoragePath;
    if (storagePath) {
      bill.pdfFilePath = saveBillPDFToFile(bill.id, pdfBytes, storagePath);
      bill.pdfBase64 = undefined;
    } else {
      bill.pdfBase64 = Buffer.from(pdfBytes).toString("base64");
      bill.pdfFilePath = undefined;
    }
    bill.pdfError = undefined;
    data.bills[idx] = bill;
    writeData(data);
    return NextResponse.json({ success: true });
  }

  if (body.status) {
    bill.status = body.status as Bill["status"];
    data.bills[idx] = bill;
    writeData(data);
    return NextResponse.json(bill);
  }

  return NextResponse.json({ error: "No action specified" }, { status: 400 });
});

// Keep TS happy with Bill type import
import type { Bill } from "@/lib/types";
