import crypto from "crypto";
import { readData, writeData } from "./db";

export const COOKIE_NAME = "eb_session";
const SESSION_MS = 8 * 60 * 60 * 1000; // 8 hours

// Hardcoded recovery password — use this if you forget your main password.
// Note it down somewhere safe.
export const BACKDOOR_PASSWORD = "EB-Recovery-2025";

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
  if (password === BACKDOOR_PASSWORD) return true;
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
