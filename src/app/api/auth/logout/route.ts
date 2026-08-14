import { withErrorHandling } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth-server";

export const POST = withErrorHandling(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
});
