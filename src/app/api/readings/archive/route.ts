import { withErrorHandling } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { readData, archiveOldReadings } from "@/lib/db";

export const POST = withErrorHandling(async () => {
  const data = readData();
  const months = data.schedulerSettings.readingsArchiveMonths ?? 0;
  if (months <= 0) {
    return NextResponse.json({ error: "Archive threshold not configured (set Readings Archive in System Settings)" }, { status: 400 });
  }
  const result = archiveOldReadings(months);
  return NextResponse.json(result);
});
