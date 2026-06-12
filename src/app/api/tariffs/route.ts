import { NextRequest, NextResponse } from "next/server";
import { readData, writeData, generateId } from "@/lib/db";
import type { TariffRate } from "@/lib/types";

export async function GET() {
  const data = readData();
  return NextResponse.json(data.tariffRates.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)));
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Omit<TariffRate, "id">;
  const data = readData();
  const tariff: TariffRate = { ...body, id: generateId() };
  data.tariffRates.push(tariff);
  writeData(data);
  return NextResponse.json(tariff, { status: 201 });
}
