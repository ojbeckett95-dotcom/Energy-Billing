import { NextRequest, NextResponse } from "next/server";
import { readData } from "@/lib/db";
import { verifyPassword, createSessionToken, getSessionSecret, COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "@/lib/auth-server";

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

const attempts = new Map<string, { count: number; firstAt: number }>();

function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

function isRateLimited(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

export async function POST(req: NextRequest) {
  const key = clientKey(req);
  if (isRateLimited(key)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const { password } = await req.json() as { password: string };
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const data = readData();
  const ok = await verifyPassword(password, data.authSettings?.passwordHash);
  if (!ok) {
    recordFailure(key);
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  attempts.delete(key);

  const secret = process.env.SESSION_SECRET ?? getSessionSecret();
  const token = createSessionToken(secret);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
  return res;
}
