import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import { hashPassword, createSessionToken, getSessionSecret, sessionCookieOptions, COOKIE_NAME } from "@/lib/auth-server";

// Only callable when no password is set yet (first-run setup)
export async function POST(req: NextRequest) {
  const data = readData();
  if (data.authSettings?.passwordHash) {
    return NextResponse.json({ error: "Password already configured" }, { status: 403 });
  }

  let password: unknown;
  try {
    ({ password } = await req.json() as { password?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  data.authSettings.passwordHash = await hashPassword(password);
  writeData(data);

  const token = createSessionToken(getSessionSecret());

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
  return res;
}
