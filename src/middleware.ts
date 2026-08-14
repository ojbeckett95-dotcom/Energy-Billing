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
    if (!/^[0-9a-f]+$/i.test(sigHex) || sigHex.length % 2 !== 0) return false;
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

  // Auth requires SESSION_SECRET (the Electron launcher and any production
  // deployment must provide it). Without it we fail closed outside development.
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse(
      "Server misconfigured: SESSION_SECRET is not set, so sessions cannot be verified.",
      { status: 503 }
    );
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !await verifyToken(token, secret)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
