import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "eb_session";

// Paths that never require auth
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/_next", "/favicon.ico"];

async function verifyToken(token: string, secret: string): Promise<boolean> {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 0) return false;
    const payload = token.slice(0, dot);
    const sigHex  = token.slice(dot + 1);

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false, ["verify"]
    );
    // Convert hex sig to bytes
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payload));
    if (!valid) return false;

    const { exp } = JSON.parse(atob(payload));
    return typeof exp === "number" && Date.now() < exp;
  } catch { return false; }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public paths
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // No SESSION_SECRET = dev mode, skip auth
  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !await verifyToken(token, secret)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
