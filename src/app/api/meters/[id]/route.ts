import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import { conflict, notFound } from "@/lib/api-response";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();
  const meter = data.meters.find((m) => m.id === id);
  if (!meter) return notFound();
  return NextResponse.json(meter);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data = readData();
  const idx = data.meters.findIndex((m) => m.id === id);
  if (idx === -1) return notFound();
  const updated = { ...data.meters[idx], ...body, id };
  // null or empty string means unassign
  if (body.customerId === null || body.customerId === "") {
    delete updated.customerId;
  }
  data.meters[idx] = updated;
  writeData(data);
  return NextResponse.json(data.meters[idx]);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();
  const hasReadings = data.meterReadings.some((r) => r.meterId === id);
  if (hasReadings) {
    return conflict("Cannot delete meter: readings exist for it. Delete the readings first.");
  }
  data.meters = data.meters.filter((m) => m.id !== id);
  writeData(data);
  return NextResponse.json({ success: true });
}
