import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  const { currentPassword, newPassword } = await req.json() as { currentPassword: string; newPassword: string };

  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
  }

  const data = readData();
  const ok = await verifyPassword(currentPassword, data.authSettings?.passwordHash);
  if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });

  data.authSettings.passwordHash = await hashPassword(newPassword);
  writeData(data);
  return NextResponse.json({ ok: true });
}
