import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAuth } from "@/lib/auth-server";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

export async function POST(req: NextRequest) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;

  const flagFile = path.join(DATA_DIR, "restart.flag");
  fs.writeFileSync(flagFile, new Date().toISOString(), "utf-8");
  return NextResponse.json({ ok: true });
}
