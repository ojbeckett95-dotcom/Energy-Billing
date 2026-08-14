import { withErrorHandling } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json() as { readingDate?: string; tariff1Kwh?: number; tariff2Kwh?: number; tariff3Kwh?: number; tariff4Kwh?: number; readMethod?: string; notes?: string };
  const data = readData();
  const idx = data.meterReadings.findIndex((r) => r.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const reading = data.meterReadings[idx];
  const billExists = reading.billedInBillId && reading.billedInBillId !== "unlinked" && reading.billedInBillId !== "manual" && data.bills.some(b => b.id === reading.billedInBillId);
  if (billExists) {
    return NextResponse.json(
      { error: "Cannot edit a reading that is linked to a bill. Delete the bill first." },
      { status: 409 }
    );
  }

  data.meterReadings[idx] = {
    ...reading,
    ...(body.readingDate !== undefined && { readingDate: body.readingDate }),
    ...(body.tariff1Kwh !== undefined && { tariff1Kwh: body.tariff1Kwh }),
    ...(body.tariff2Kwh !== undefined && { tariff2Kwh: body.tariff2Kwh }),
    ...(body.tariff3Kwh !== undefined && { tariff3Kwh: body.tariff3Kwh }),
    ...(body.tariff4Kwh !== undefined && { tariff4Kwh: body.tariff4Kwh }),
    ...(body.readMethod !== undefined && { readMethod: body.readMethod as "manual" | "modbus" }),
    ...(body.notes !== undefined && { notes: body.notes }),
  };
  writeData(data);
  return NextResponse.json(data.meterReadings[idx]);
});

export const DELETE = withErrorHandling(async (_: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const data = readData();
  const reading = data.meterReadings.find((r) => r.id === id);
  if (!reading) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const billExists = reading.billedInBillId && reading.billedInBillId !== "unlinked" && reading.billedInBillId !== "manual" && data.bills.some(b => b.id === reading.billedInBillId);
  if (billExists) {
    return NextResponse.json(
      { error: "Reading is linked to a bill — delete the bill first." },
      { status: 409 }
    );
  }

  data.meterReadings = data.meterReadings.filter((r) => r.id !== id);
  writeData(data);
  return NextResponse.json({ success: true });
});
