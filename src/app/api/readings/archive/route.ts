import { NextResponse } from "next/server";
import { readData, archiveOldReadings } from "@/lib/db";

export async function POST() {
  const data = readData();
  const months = data.schedulerSettings.readingsArchiveMonths ?? 0;
  if (months <= 0) {
    return NextResponse.json({ error: "Archive threshold not configured (set Readings Archive in System Settings)" }, { status: 400 });
  }
  const result = archiveOldReadings(months);
  return NextResponse.json(result);
}
