import { NextResponse } from "next/server";
import { readData, archiveOldReadings } from "@/lib/db";
import { badRequest } from "@/lib/api-response";

export async function POST() {
  const data = readData();
  const months = data.schedulerSettings.readingsArchiveMonths ?? 0;
  if (months <= 0) {
    return badRequest("Archive threshold not configured (set Readings Archive in System Settings)");
  }
  const result = archiveOldReadings(months);
  return NextResponse.json(result);
}
