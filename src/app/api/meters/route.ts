import { withErrorHandling } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { readData, writeData, generateId } from "@/lib/db";
import type { Meter } from "@/lib/types";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");
  const unassigned = searchParams.get("unassigned");
  const data = readData();
  let meters = data.meters;
  if (unassigned === "true") {
    meters = meters.filter((m) => !m.customerId);
  } else if (customerId) {
    meters = meters.filter((m) => m.customerId === customerId);
  }
  return NextResponse.json(meters);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json() as Omit<Meter, "id">;
  const data = readData();
  const meter: Meter = { ...body, id: generateId() };
  data.meters.push(meter);
  writeData(data);
  return NextResponse.json(meter, { status: 201 });
});
