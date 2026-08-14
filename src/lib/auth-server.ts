import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "./db";

export const COOKIE_NAME = "eb_session";
const SESSION_MS = 8 * 60 * 60 * 1000; // 8 hours

/** Cookie options shared by every route that issues a session cookie. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "strict",
  path: "/",
  maxAge: SESSION_MS / 1000,
} as const;

// ── Password hashing (scrypt) ────────────────────────────────────────────────

export function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) =>
      err ? reject(err) : resolve(`${salt}:${key.toString("hex")}`)
    )
  );
}

export function checkPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) return reject(err);
      try {
        resolve(crypto.timingSafeEqual(key, Buffer.from(hash, "hex")));
      } catch { resolve(false); }
    })
  );
}

export async function verifyPassword(password: string, storedHash: string | undefined): Promise<boolean> {
  if (!storedHash) return false;
  return checkPassword(password, storedHash);
}

// ── Session tokens (HMAC-SHA256) ─────────────────────────────────────────────

export function createSessionToken(secret: string): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_MS })).toString("base64");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string, secret: string): boolean {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 0) return false;
    const payload = token.slice(0, dot);
    const sig     = token.slice(dot + 1);
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (sig.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return false;
    const { exp } = JSON.parse(Buffer.from(payload, "base64").toString());
    return typeof exp === "number" && Date.now() < exp;
  } catch { return false; }
}

// ── Session secret (lazy-init from data file) ─────────────────────────────────

export function getSessionSecret(): string {
  const data = readData();
  if (data.authSettings?.sessionSecret) return data.authSettings.sessionSecret;
  const secret = crypto.randomBytes(32).toString("hex");
  data.authSettings = { ...data.authSettings, sessionSecret: secret };
  writeData(data);
  return secret;
}

// ── Route guards ──────────────────────────────────────────────────────────────

/** True when the request carries a valid session cookie, or when no password
 *  has been configured yet (first-run setup). */
export function isAuthenticated(req: NextRequest): boolean {
  const data = readData();
  if (!data.authSettings?.passwordHash) return true;

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const secret = process.env.SESSION_SECRET ?? getSessionSecret();
  return verifySessionToken(token, secret);
}

/** Returns a 401 response when the request is unauthenticated, otherwise null. */
export function requireAuth(req: NextRequest): NextResponse | null {
  if (isAuthenticated(req)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
