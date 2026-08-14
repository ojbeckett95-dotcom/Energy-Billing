import { NextRequest, NextResponse } from "next/server";
import { readData, updateData, generateId } from "@/lib/db";
import { parseBody, tariffSchema } from "@/lib/validation";
import type { TariffRate } from "@/lib/types";

export async function GET() {
  const data = readData();
  return NextResponse.json(data.tariffRates.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)));
}

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, tariffSchema);
  if (!parsed.ok) return parsed.response;
  const tariff: TariffRate = { ...parsed.data, id: generateId() };
  updateData((data) => { data.tariffRates.push(tariff); });
  return NextResponse.json(tariff, { status: 201 });
}
