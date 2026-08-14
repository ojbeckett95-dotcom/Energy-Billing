import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import type { SchedulerSettings } from "@/lib/types";

export async function GET(req: NextRequest) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;

  const data = readData();
  return NextResponse.json(data.schedulerSettings);
}

export async function PUT(req: NextRequest) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;

  const body = await req.json() as Partial<SchedulerSettings>;
  const data = readData();
  data.schedulerSettings = { ...data.schedulerSettings, ...body };
  writeData(data);
  return NextResponse.json(data.schedulerSettings);
}
