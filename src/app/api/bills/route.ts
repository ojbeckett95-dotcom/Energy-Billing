import { NextRequest, NextResponse } from "next/server";
import { readData, updateData, generateBillId, saveBillPDFToFile } from "@/lib/db";
import { calculateBillCharges } from "@/lib/billing";
import { generateBillPDF } from "@/lib/pdf-generator";
import { parseBody, generateBillSchema, idListSchema } from "@/lib/validation";
import type { Bill } from "@/lib/types";

// DELETE /api/bills — bulk delete by IDs
export async function DELETE(req: NextRequest) {
  const parsed = await parseBody(req, idListSchema);
  if (!parsed.ok) return parsed.response;
  const { ids } = parsed.data;
  const idSet = new Set(ids);

  const pdfPaths = updateData((data) => {
    const paths = data.bills.filter(b => idSet.has(b.id) && b.pdfFilePath).map(b => b.pdfFilePath!);

    // Clear billedInBillId from readings referencing any of these bills
    data.meterReadings = data.meterReadings.map((r) => {
      if (!r.billedInBillId || !idSet.has(r.billedInBillId)) return r;
      const { billedInBillId: _, ...rest } = r;
      return rest;
    });

    data.bills = data.bills.filter(b => !idSet.has(b.id));
    return paths;
  });

  // Delete PDF files from disk for any bills that had them
  const fs = await import("fs");
  for (const pdfPath of pdfPaths) {
    try {
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    } catch { /* ignore */ }
  }

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
  const parsed = await parseBody(req, generateBillSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const data = readData();

  const customer = data.customers.find((c) => c.id === body.customerId);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const tariff = data.tariffRates.find((t) => t.id === body.tariffRateId);
  if (!tariff) return NextResponse.json({ error: "Tariff not found" }, { status: 404 });

  const openingReading = data.meterReadings.find((r) => r.id === body.openingReadingId);
  if (!openingReading) return NextResponse.json({ error: "Opening reading not found" }, { status: 404 });

  const closingReading = data.meterReadings.find((r) => r.id === body.closingReadingId);
  if (!closingReading) return NextResponse.json({ error: "Closing reading not found" }, { status: 404 });

  const meter = body.meterId ? data.meters.find(m => m.id === body.meterId) : undefined;
  if (body.meterId && !meter) return NextResponse.json({ error: "Meter not found" }, { status: 404 });
  if (meter && meter.customerId !== body.customerId) {
    return NextResponse.json({ error: "Meter does not belong to this customer" }, { status: 400 });
  }
  for (const [label, reading] of [["Opening", openingReading], ["Closing", closingReading]] as const) {
    const inScope = body.meterId ? reading.meterId === body.meterId : reading.customerId === body.customerId;
    if (!inScope) {
      return NextResponse.json({ error: `${label} reading belongs to a different ${body.meterId ? "meter" : "customer"}` }, { status: 400 });
    }
  }
  if (closingReading.readingDate < openingReading.readingDate) {
    return NextResponse.json({ error: "Closing reading is older than the opening reading" }, { status: 400 });
  }

  const charges = calculateBillCharges(
    tariff, openingReading, closingReading, body.billingPeriodStart, body.billingPeriodEnd,
  );
  const generatedAt = new Date();

  const bill: Bill = {
    id: generateBillId(customer.accountNumber, meter?.serialNumber, generatedAt, data.bills.map(b => b.id)),
    customerId: body.customerId,
    ...(body.meterId && { meterId: body.meterId }),
    tariffRateId: body.tariffRateId,
    billingPeriodStart: body.billingPeriodStart,
    billingPeriodEnd: body.billingPeriodEnd,
    openingReadingId: body.openingReadingId,
    closingReadingId: body.closingReadingId,
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

  const openingDate = openingReading.readingDate;
  const closingDate = closingReading.readingDate;

  // Claim the ID against the persisted bills, which may have grown since the read above.
  updateData((fresh) => {
    bill.id = generateBillId(customer.accountNumber, meter?.serialNumber, generatedAt, fresh.bills.map(b => b.id));
    fresh.bills.push(bill);

    // Mark ALL readings for this meter (or customer) within the billing period as billed
    fresh.meterReadings = fresh.meterReadings.map((r) => {
      const sameScope = body.meterId ? r.meterId === body.meterId : r.customerId === body.customerId;
      if (!sameScope) return r;
      if (r.readingDate < openingDate || r.readingDate > closingDate) return r;
      return { ...r, billedInBillId: bill.id };
    });
  });

  let pdfError: string | undefined;
  try {
    const pdfBytes = await generateBillPDF(bill, customer, tariff, data.branding, openingReading, closingReading, meter);
    const storagePath = data.schedulerSettings.pdfStoragePath;
    if (storagePath) {
      bill.pdfFilePath = saveBillPDFToFile(bill.id, pdfBytes, storagePath);
    } else {
      bill.pdfBase64 = Buffer.from(pdfBytes).toString("base64");
    }
    updateData((fresh) => {
      const idx = fresh.bills.findIndex(b => b.id === bill.id);
      if (idx >= 0) fresh.bills[idx] = bill;
    });
  } catch (err) {
    console.error("PDF generation failed:", err);
    pdfError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({ ...bill, ...(pdfError && { pdfError }) }, { status: 201 });
}
