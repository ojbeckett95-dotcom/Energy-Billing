import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { readData, updateData } from "./db";

export const COOKIE_NAME = "eb_session";
const SESSION_MS = 8 * 60 * 60 * 1000; // 8 hours

/** Auth can only be turned off by an explicit opt-in, never by a missing env var. */
export function isAuthDisabled(): boolean {
  return process.env.EB_DISABLE_AUTH === "1";
}

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
  if (!password || !storedHash) return false;
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

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MS / 1000,
  };
}

// ── Session secret (lazy-init from data file) ─────────────────────────────────

export function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const existing = readData().authSettings?.sessionSecret;
  if (existing) return existing;
  return updateData((data) => {
    if (data.authSettings?.sessionSecret) return data.authSettings.sessionSecret;
    const secret = crypto.randomBytes(32).toString("hex");
    data.authSettings = { ...data.authSettings, sessionSecret: secret };
    return secret;
  });
}

/** Replaces the signing secret, invalidating every existing session token. */
export function rotateSessionSecret(): string {
  const secret = crypto.randomBytes(32).toString("hex");
  updateData((data) => {
    data.authSettings = { ...data.authSettings, sessionSecret: secret };
  });
  return secret;
}

// ── Route guard ───────────────────────────────────────────────────────────────

/** Returns a 401 response when the request is not authenticated, or null when it may proceed.
 *  Requests are allowed through before first-run setup, while no password exists yet. */
export function requireAuth(req: NextRequest): NextResponse | null {
  if (isAuthDisabled()) return null;
  if (!readData().authSettings?.passwordHash) return null;

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token && verifySessionToken(token, getSessionSecret())) return null;
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

type RouteHandler<C> = (req: NextRequest, ctx: C) => Response | Promise<Response>;

/** Wraps a route handler so it rejects unauthenticated requests.
 *  The Edge middleware cannot read the data file, so this is where API auth is enforced. */
export function withAuth<C>(handler: RouteHandler<C>): RouteHandler<C> {
  return (req, ctx) => requireAuth(req) ?? handler(req, ctx);
}
