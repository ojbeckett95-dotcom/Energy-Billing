import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth-server";
import { badRequest } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  const { currentPassword, newPassword } = await req.json() as { currentPassword: string; newPassword: string };

  if (!newPassword || newPassword.length < 6) {
    return badRequest("New password must be at least 6 characters");
  }

  const data = readData();
  const ok = await verifyPassword(currentPassword, data.authSettings?.passwordHash);
  if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });

  data.authSettings.passwordHash = await hashPassword(newPassword);
  writeData(data);
  return NextResponse.json({ ok: true });
}
