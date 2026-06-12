import { NextRequest, NextResponse } from "next/server";
import { readData } from "@/lib/db";
import { verifyPassword, createSessionToken, getSessionSecret, COOKIE_NAME } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  const { password } = await req.json() as { password: string };
  if (!password) return NextResponse.json({ error: "Password required" }, { status: 400 });

  const data = readData();
  const ok = await verifyPassword(password, data.authSettings?.passwordHash);
  if (!ok) return NextResponse.json({ error: "Incorrect password" }, { status: 401 });

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
