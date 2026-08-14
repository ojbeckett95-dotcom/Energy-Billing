import { withErrorHandling } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";

export const GET = withErrorHandling(async (_: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const data = readData();
  const meter = data.meters.find((m) => m.id === id);
  if (!meter) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(meter);
});

export const PUT = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json();
  const data = readData();
  const idx = data.meters.findIndex((m) => m.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updated = { ...data.meters[idx], ...body, id };
  // null or empty string means unassign
  if (body.customerId === null || body.customerId === "") {
    delete updated.customerId;
  }
  data.meters[idx] = updated;
  writeData(data);
  return NextResponse.json(data.meters[idx]);
});

export const DELETE = withErrorHandling(async (_: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const data = readData();
  const hasReadings = data.meterReadings.some((r) => r.meterId === id);
  if (hasReadings) {
    return NextResponse.json(
      { error: "Cannot delete meter: readings exist for it. Delete the readings first." },
      { status: 409 }
    );
  }
  data.meters = data.meters.filter((m) => m.id !== id);
  writeData(data);
  return NextResponse.json({ success: true });
});
