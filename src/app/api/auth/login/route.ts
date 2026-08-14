import { NextRequest, NextResponse } from "next/server";
import { readData } from "@/lib/db";
import { verifyPassword, createSessionToken, getSessionSecret, sessionCookieOptions, COOKIE_NAME } from "@/lib/auth-server";
import { clientKey, isRateLimited, registerFailure, resetAttempts } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const key = clientKey(req);
  if (isRateLimited(key)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let password: unknown;
  try {
    ({ password } = await req.json() as { password?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const auth = readData().authSettings;
  const passwordOk = await verifyPassword(password, auth?.passwordHash);
  // The recovery password is set during first-run setup and is unique to this install.
  const usedRecovery = !passwordOk && await verifyPassword(password, auth?.recoveryCodeHash);
  if (!passwordOk && !usedRecovery) {
    registerFailure(key);
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  resetAttempts(key);

  const token = createSessionToken(getSessionSecret());

  const res = NextResponse.json({ ok: true, usedRecovery });
  res.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
  return res;
}
