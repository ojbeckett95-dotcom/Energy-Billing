import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import { testSmtpConnection } from "@/lib/email";
import type { EmailSettings } from "@/lib/types";

export async function GET() {
  const data = readData();
  // Mask password
  const settings = { ...data.emailSettings, smtpPassword: data.emailSettings.smtpPassword ? "••••••••" : "" };
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as Partial<EmailSettings>;
  const data = readData();
  // Don't overwrite password if masked value sent
  if (body.smtpPassword === "••••••••") {
    delete body.smtpPassword;
  }
  data.emailSettings = { ...data.emailSettings, ...body };
  writeData(data);
  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  const { action } = await req.json() as { action: string };
  if (action === "test") {
    const data = readData();
    const result = await testSmtpConnection(data.emailSettings);
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
