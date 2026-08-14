import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import { notFound } from "@/lib/api-response";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();
  data.customerTariffSchedules = data.customerTariffSchedules.filter(s => s.id !== id);
  writeData(data);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data = readData();
  const idx = data.customerTariffSchedules.findIndex(s => s.id === id);
  if (idx === -1) return notFound();
  data.customerTariffSchedules[idx] = { ...data.customerTariffSchedules[idx], ...body };
  writeData(data);
  return NextResponse.json(data.customerTariffSchedules[idx]);
}
