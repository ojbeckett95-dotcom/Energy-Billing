import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import { notFound, parseIds } from "@/lib/api-response";
import { buildBill, markReadingsBilled } from "@/lib/billing";
import { deleteBillPDF, renderAndAttachBillPDF } from "@/lib/bill-pdf";
import { clearBilledInBillId } from "@/lib/readings";

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
export async function DELETE(req: NextRequest) {
  const parsed = parseIds(await req.json() as { ids?: unknown });
  if ("error" in parsed) return parsed.error;
  const { ids } = parsed;

  const data = readData();
  const idSet = new Set(ids);

  for (const bill of data.bills) {
    if (idSet.has(bill.id)) deleteBillPDF(bill);
  }

  data.meterReadings = clearBilledInBillId(data.meterReadings, idSet);
  data.bills = data.bills.filter(b => !idSet.has(b.id));
  writeData(data);
  return NextResponse.json({ success: true, deleted: ids.length });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");
  const data = readData();
  const bills = customerId
    ? data.bills.filter((b) => b.customerId === customerId)
    : data.bills;
  return NextResponse.json(bills.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)));
}

export async function POST(req: NextRequest) {
  const body = await req.json() as GenerateBillRequest;
  const data = readData();

  const customer = data.customers.find((c) => c.id === body.customerId);
  if (!customer) return notFound("Customer not found");

  const tariff = data.tariffRates.find((t) => t.id === body.tariffRateId);
  if (!tariff) return notFound("Tariff not found");

  const openingReading = data.meterReadings.find((r) => r.id === body.openingReadingId);
  if (!openingReading) return notFound("Opening reading not found");

  const closingReading = data.meterReadings.find((r) => r.id === body.closingReadingId);
  if (!closingReading) return notFound("Closing reading not found");

  const meter = body.meterId ? data.meters.find(m => m.id === body.meterId) : undefined;

  const bill = buildBill({
    customer,
    tariff,
    meter,
    openingReading,
    closingReading,
    billingPeriodStart: body.billingPeriodStart,
    billingPeriodEnd: body.billingPeriodEnd,
  });

  await renderAndAttachBillPDF(
    bill, customer, tariff, data.branding, openingReading, closingReading, meter,
    data.schedulerSettings.pdfStoragePath, bill.id,
  );

  data.bills.push(bill);

  // Mark ALL readings for this meter (or customer) within the billing period as billed
  data.meterReadings = markReadingsBilled(
    data.meterReadings, bill, openingReading.readingDate, closingReading.readingDate,
  );

  writeData(data);

  return NextResponse.json(bill, { status: 201 });
}
