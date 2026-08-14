import { withErrorHandling } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { readData } from "@/lib/db";
import { verifySessionToken, getSessionSecret, COOKIE_NAME } from "@/lib/auth-server";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const data = readData();
  const hasPassword = !!data.authSettings?.passwordHash;

  // If no SESSION_SECRET, auth is disabled (dev mode)
  const secret = process.env.SESSION_SECRET ?? getSessionSecret();
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const authenticated = !!token && verifySessionToken(token, secret);

  return NextResponse.json({ hasPassword, authenticated });
});
