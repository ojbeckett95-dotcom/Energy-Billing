import { NextRequest, NextResponse } from "next/server";
import { readData } from "@/lib/db";
import { verifySessionToken, getSessionSecret, COOKIE_NAME } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  const data = readData();
  const hasPassword = !!data.authSettings?.passwordHash;

  const secret = getSessionSecret();
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const authenticated = !!token && verifySessionToken(token, secret);

  return NextResponse.json({ hasPassword, authenticated });
}
