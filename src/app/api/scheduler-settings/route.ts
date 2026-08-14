import { withErrorHandling } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import type { SchedulerSettings } from "@/lib/types";

export const GET = withErrorHandling(async () => {
  const data = readData();
  return NextResponse.json(data.schedulerSettings);
});

export const PUT = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json() as Partial<SchedulerSettings>;
  const data = readData();
  data.schedulerSettings = { ...data.schedulerSettings, ...body };
  writeData(data);
  return NextResponse.json(data.schedulerSettings);
});
