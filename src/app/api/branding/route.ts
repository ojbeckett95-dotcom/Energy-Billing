import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import type { BrandingSettings } from "@/lib/types";

export async function GET() {
  const data = readData();
  return NextResponse.json(data.branding);
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as Partial<BrandingSettings>;
  const data = readData();
  data.branding = { ...data.branding, ...body };
  writeData(data);
  return NextResponse.json(data.branding);
}
