import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api-response";
import { attachBillPDF, deleteBillPDF, loadBillPDF } from "@/lib/bill-pdf";
import { generateBillPDF } from "@/lib/pdf-generator";
import { sendBillEmail } from "@/lib/email";
import { clearBilledInBillId } from "@/lib/readings";
import type { Bill } from "@/lib/types";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();
  const bill = data.bills.find((b) => b.id === id);
  if (!bill) return notFound();
  return NextResponse.json(bill);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();

  const bill = data.bills.find((b) => b.id === id);
  if (bill) deleteBillPDF(bill);

  data.meterReadings = clearBilledInBillId(data.meterReadings, new Set([id]));

  data.bills = data.bills.filter((b) => b.id !== id);
  writeData(data);
  return NextResponse.json({ success: true });
}

// PATCH /api/bills/[id] – update status or regenerate PDF
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as { action?: string; status?: string };
  const data = readData();
  const idx = data.bills.findIndex((b) => b.id === id);
  if (idx === -1) return notFound();

  const bill = data.bills[idx];

  if (body.action === "send" || body.action === "resend") {
    // Send email with PDF
    const customer = data.customers.find((c) => c.id === bill.customerId);
    if (!customer) return notFound("Customer not found");

    const meter = bill.meterId ? data.meters.find(m => m.id === bill.meterId) : undefined;

    let pdfBytes: Uint8Array | null = loadBillPDF(bill);
    if (!pdfBytes) {
      const tariff = data.tariffRates.find((t) => t.id === bill.tariffRateId);
      const openingReading = data.meterReadings.find((r) => r.id === bill.openingReadingId);
      const closingReading = data.meterReadings.find((r) => r.id === bill.closingReadingId);
      if (!tariff || !openingReading || !closingReading) {
        return badRequest("Missing data for PDF generation");
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
      return badRequest("Missing data");
    }
    const meter = bill.meterId ? data.meters.find(m => m.id === bill.meterId) : undefined;
    const pdfBytes = await generateBillPDF(bill, customer, tariff, data.branding, openingReading, closingReading, meter);
    attachBillPDF(bill, pdfBytes, data.schedulerSettings.pdfStoragePath);
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

  return badRequest("No action specified");
}
