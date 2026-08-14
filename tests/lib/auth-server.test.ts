import { describe, it, expect, beforeEach, afterAll } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "eb-auth-"));
process.env.DATA_DIR = DATA_DIR;

const {
  BACKDOOR_PASSWORD,
  COOKIE_NAME,
  hashPassword,
  checkPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  getSessionSecret,
} = await import("@/lib/auth-server");
const { readData, writeData } = await import("@/lib/db");

const DATA_FILE = path.join(DATA_DIR, "app-data.json");

beforeEach(() => {
  fs.rmSync(DATA_FILE, { force: true });
});

afterAll(() => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

describe("password hashing", () => {
  it("produces a salt:hash pair with a fresh salt each time", async () => {
    const a = await hashPassword("hunter2");
    const b = await hashPassword("hunter2");
    expect(a).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(a).not.toBe(b);
  });

  it("accepts the correct password and rejects a wrong one", async () => {
    const stored = await hashPassword("hunter2");
    await expect(checkPassword("hunter2", stored)).resolves.toBe(true);
    await expect(checkPassword("hunter3", stored)).resolves.toBe(false);
  });

  it("returns false instead of throwing for a malformed stored hash", async () => {
    await expect(checkPassword("hunter2", "no-separator")).resolves.toBe(false);
    await expect(checkPassword("hunter2", "salt:zz")).resolves.toBe(false);
  });
});

describe("verifyPassword", () => {
  it("accepts the recovery password regardless of the stored hash", async () => {
    await expect(verifyPassword(BACKDOOR_PASSWORD, undefined)).resolves.toBe(true);
    await expect(verifyPassword(BACKDOOR_PASSWORD, await hashPassword("other"))).resolves.toBe(true);
  });

  it("rejects any password when no hash is configured", async () => {
    await expect(verifyPassword("hunter2", undefined)).resolves.toBe(false);
    await expect(verifyPassword("", undefined)).resolves.toBe(false);
  });

  it("delegates to the stored hash otherwise", async () => {
    const stored = await hashPassword("hunter2");
    await expect(verifyPassword("hunter2", stored)).resolves.toBe(true);
    await expect(verifyPassword("nope", stored)).resolves.toBe(false);
  });
});

describe("session tokens", () => {
  const secret = "s3cret";

  it("round-trips a freshly created token", () => {
    const token = createSessionToken(secret);
    expect(token).toMatch(/^[A-Za-z0-9+/=]+\.[0-9a-f]{64}$/);
    expect(verifySessionToken(token, secret)).toBe(true);
  });

  it("rejects a token signed with a different secret", () => {
    expect(verifySessionToken(createSessionToken(secret), "other")).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const token = createSessionToken(secret);
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ exp: Date.now() + 10_000_000 })).toString("base64");
    expect(forged).not.toBe(payload);
    expect(verifySessionToken(`${forged}.${sig}`, secret)).toBe(false);
  });

  it("rejects malformed tokens", () => {
    expect(verifySessionToken("", secret)).toBe(false);
    expect(verifySessionToken("no-dot-here", secret)).toBe(false);
    expect(verifySessionToken(".", secret)).toBe(false);
  });

  it("rejects an expired token", () => {
    const payload = Buffer.from(JSON.stringify({ exp: Date.now() - 1000 })).toString("base64");
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    expect(verifySessionToken(`${payload}.${sig}`, secret)).toBe(false);
  });

  it("rejects a correctly signed token whose payload has no expiry", () => {
    const payload = Buffer.from(JSON.stringify({ user: "admin" })).toString("base64");
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    expect(verifySessionToken(`${payload}.${sig}`, secret)).toBe(false);
  });
});

describe("getSessionSecret", () => {
  it("persists a generated secret and reuses it on later calls", () => {
    const secret = getSessionSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(readData().authSettings.sessionSecret).toBe(secret);
    expect(getSessionSecret()).toBe(secret);
  });

  it("returns the secret already stored in the data file", () => {
    const data = structuredClone(readData());
    data.authSettings = { sessionSecret: "a".repeat(64) };
    writeData(data);
    expect(getSessionSecret()).toBe("a".repeat(64));
  });
});

describe("COOKIE_NAME", () => {
  it("matches the cookie name the middleware checks", () => {
    expect(COOKIE_NAME).toBe("eb_session");
  });
});
