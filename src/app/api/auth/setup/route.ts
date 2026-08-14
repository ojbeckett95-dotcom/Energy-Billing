import { NextRequest, NextResponse } from "next/server";
import { readData, updateData } from "@/lib/db";
import {
  hashPassword,
  createSessionToken,
  getSessionSecret,
  sessionCookieOptions,
  COOKIE_NAME,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth-server";

// Only callable when no password is set yet (first-run setup)
export async function POST(req: NextRequest) {
  if (readData().authSettings?.passwordHash) {
    return NextResponse.json({ error: "Password already configured" }, { status: 403 });
  }

  let password: unknown;
  let recoveryPassword: unknown;
  try {
    ({ password, recoveryPassword } = await req.json() as { password?: unknown; recoveryPassword?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
  }
  if (typeof recoveryPassword !== "string" || recoveryPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Recovery password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
  }
  if (recoveryPassword === password) {
    return NextResponse.json({ error: "Recovery password must differ from your password" }, { status: 400 });
  }

  const [passwordHash, recoveryCodeHash] = await Promise.all([
    hashPassword(password),
    hashPassword(recoveryPassword),
  ]);

  const created = updateData((data) => {
    if (data.authSettings?.passwordHash) return false;
    data.authSettings = { ...data.authSettings, passwordHash, recoveryCodeHash };
    return true;
  });
  if (!created) {
    return NextResponse.json({ error: "Password already configured" }, { status: 403 });
  }

  const token = createSessionToken(getSessionSecret());

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
  return res;
}
