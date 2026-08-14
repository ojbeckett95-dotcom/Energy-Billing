import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { middleware, config } from "@/middleware";

const SECRET = "test-secret";

function token(exp: number, secret = SECRET): string {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function request(pathname: string, cookie?: string): NextRequest {
  const req = new NextRequest(`http://localhost${pathname}`);
  if (cookie !== undefined) req.cookies.set("eb_session", cookie);
  return req;
}

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe("middleware", () => {
  it.each(["/login", "/api/auth/login", "/_next/static/chunk.js", "/favicon.ico"])(
    "allows the public path %s without a session",
    async pathname => {
      const res = await middleware(request(pathname));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  );

  it("skips auth entirely when no SESSION_SECRET is set", async () => {
    delete process.env.SESSION_SECRET;
    const res = await middleware(request("/bills"));
    expect(res.status).toBe(200);
  });

  it("allows a request carrying a valid session cookie", async () => {
    const res = await middleware(request("/bills", token(Date.now() + 60_000)));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects to /login when the cookie is missing", async () => {
    const res = await middleware(request("/bills"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it.each([
    ["expired", () => token(Date.now() - 1000)],
    ["signed with another secret", () => token(Date.now() + 60_000, "other-secret")],
    ["malformed", () => "not-a-token"],
    ["empty", () => ""],
    ["with a non-hex signature", () => `${token(Date.now() + 60_000).split(".")[0]}.zz`],
  ])("redirects to /login for a token that is %s", async (_label, make) => {
    const res = await middleware(request("/bills", make()));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("matches every path except static assets", () => {
    expect(config.matcher).toEqual(["/((?!_next/static|_next/image|favicon\\.ico).*)"]);
  });
});
