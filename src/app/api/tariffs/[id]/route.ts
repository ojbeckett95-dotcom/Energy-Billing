import { withErrorHandling } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import type { TariffRate } from "@/lib/types";

export const PUT = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json() as Partial<TariffRate>;
  const data = readData();
  const idx = data.tariffRates.findIndex((t) => t.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  data.tariffRates[idx] = { ...data.tariffRates[idx], ...body };
  writeData(data);
  return NextResponse.json(data.tariffRates[idx]);
});

export const DELETE = withErrorHandling(async (_: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const data = readData();
  data.tariffRates = data.tariffRates.filter((t) => t.id !== id);
  writeData(data);
  return NextResponse.json({ success: true });
});
