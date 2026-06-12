import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import { hashPassword, createSessionToken, getSessionSecret, COOKIE_NAME } from "@/lib/auth-server";

// Only callable when no password is set yet (first-run setup)
export async function POST(req: NextRequest) {
  const data = readData();
  if (data.authSettings?.passwordHash) {
    return NextResponse.json({ error: "Password already configured" }, { status: 403 });
  }

  const { password } = await req.json() as { password: string };
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  data.authSettings.passwordHash = await hashPassword(password);
  writeData(data);

  const secret = process.env.SESSION_SECRET ?? getSessionSecret();
  const token = createSessionToken(secret);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 3600,
  });
  return res;
}
