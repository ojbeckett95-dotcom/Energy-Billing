import { NextRequest, NextResponse } from "next/server";
import { readData, updateData } from "@/lib/db";
import {
  verifyPassword,
  hashPassword,
  requireAuth,
  rotateSessionSecret,
  createSessionToken,
  sessionCookieOptions,
  COOKIE_NAME,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth-server";
import { clientKey, isRateLimited, registerFailure, resetAttempts } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const unauthenticated = requireAuth(req);
  if (unauthenticated) return unauthenticated;

  const key = clientKey(req);
  if (isRateLimited(key)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let currentPassword: unknown, newPassword: unknown, newRecoveryPassword: unknown;
  try {
    ({ currentPassword, newPassword, newRecoveryPassword } = await req.json() as {
      currentPassword?: unknown; newPassword?: unknown; newRecoveryPassword?: unknown;
    });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (newPassword !== undefined && (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH)) {
    return NextResponse.json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
  }
  if (newRecoveryPassword !== undefined && (typeof newRecoveryPassword !== "string" || newRecoveryPassword.length < MIN_PASSWORD_LENGTH)) {
    return NextResponse.json({ error: `Recovery password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
  }
  if (newPassword === undefined && newRecoveryPassword === undefined) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  const auth = readData().authSettings;
  // Either the login password or the recovery password confirms the change, so a
  // user who signed in with the recovery password can still set a new password.
  const ok = typeof currentPassword === "string"
    && (await verifyPassword(currentPassword, auth?.passwordHash)
      || await verifyPassword(currentPassword, auth?.recoveryCodeHash));
  if (!ok) {
    registerFailure(key);
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }
  resetAttempts(key);

  const passwordHash = typeof newPassword === "string" ? await hashPassword(newPassword) : undefined;
  const recoveryCodeHash = typeof newRecoveryPassword === "string" ? await hashPassword(newRecoveryPassword) : undefined;

  updateData((data) => {
    if (passwordHash) data.authSettings.passwordHash = passwordHash;
    if (recoveryCodeHash) data.authSettings.recoveryCodeHash = recoveryCodeHash;
  });

  // Invalidate sessions issued under the old password, then re-issue one for this client.
  const secret = rotateSessionSecret();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, createSessionToken(secret), sessionCookieOptions());
  return res;
}
