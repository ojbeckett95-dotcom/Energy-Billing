import { withErrorHandling } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { readData, writeData, generateId } from "@/lib/db";
import type { TariffRate } from "@/lib/types";

export const GET = withErrorHandling(async () => {
  const data = readData();
  return NextResponse.json(data.tariffRates.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)));
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json() as Omit<TariffRate, "id">;
  const data = readData();
  const tariff: TariffRate = { ...body, id: generateId() };
  data.tariffRates.push(tariff);
  writeData(data);
  return NextResponse.json(tariff, { status: 201 });
});
