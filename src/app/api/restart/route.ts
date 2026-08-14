import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { withAuth } from "@/lib/auth-server";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

export const POST = withAuth(async () => {
  const flagFile = path.join(DATA_DIR, "restart.flag");
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(flagFile, new Date().toISOString(), "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not request restart: ${msg}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
});
