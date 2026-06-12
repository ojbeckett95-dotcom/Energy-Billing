import { NextRequest, NextResponse } from "next/server";
import { readData, writeData, generateId } from "@/lib/db";
import type { CustomerTariffSchedule } from "@/lib/types";

export async function GET(req: NextRequest) {
  const customerId = new URL(req.url).searchParams.get("customerId");
  const data = readData();
  const schedules = customerId
    ? data.customerTariffSchedules.filter(s => s.customerId === customerId)
    : data.customerTariffSchedules;
  return NextResponse.json(schedules.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)));
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Omit<CustomerTariffSchedule, "id">;
  const data = readData();
  const schedule: CustomerTariffSchedule = { ...body, id: generateId() };
  data.customerTariffSchedules.push(schedule);
  writeData(data);
  return NextResponse.json(schedule, { status: 201 });
}
