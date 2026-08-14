import { NextRequest, NextResponse } from "next/server";
import { readData, updateData } from "@/lib/db";
import { parseBody, schedulerSettingsPatchSchema } from "@/lib/validation";

export async function GET() {
  const data = readData();
  return NextResponse.json(data.schedulerSettings);
}

export async function PUT(req: NextRequest) {
  const parsed = await parseBody(req, schedulerSettingsPatchSchema);
  if (!parsed.ok) return parsed.response;

  const settings = updateData((data) => {
    data.schedulerSettings = { ...data.schedulerSettings, ...parsed.data };
    return data.schedulerSettings;
  });
  return NextResponse.json(settings);
}
