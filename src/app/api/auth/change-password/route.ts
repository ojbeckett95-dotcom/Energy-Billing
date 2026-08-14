import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import {
  verifyPassword,
  hashPassword,
  requireAuth,
  rotateSessionSecret,
  createSessionToken,
  sessionCookieOptions,
  COOKIE_NAME,
} from "@/lib/auth-server";
import { clientKey, isRateLimited, registerFailure, resetAttempts } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const unauthenticated = requireAuth(req);
  if (unauthenticated) return unauthenticated;

  const key = clientKey(req);
  if (isRateLimited(key)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let currentPassword: unknown, newPassword: unknown;
  try {
    ({ currentPassword, newPassword } = await req.json() as { currentPassword?: unknown; newPassword?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  const data = readData();
  const ok = typeof currentPassword === "string"
    && await verifyPassword(currentPassword, data.authSettings?.passwordHash);
  if (!ok) {
    registerFailure(key);
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }
  resetAttempts(key);

  data.authSettings.passwordHash = await hashPassword(newPassword);
  writeData(data);

  // Invalidate sessions issued under the old password, then re-issue one for this client.
  const secret = rotateSessionSecret();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, createSessionToken(secret), sessionCookieOptions());
  return res;
}
