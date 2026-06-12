import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

export async function POST() {
  const flagFile = path.join(DATA_DIR, "restart.flag");
  fs.writeFileSync(flagFile, new Date().toISOString(), "utf-8");
  return NextResponse.json({ ok: true });
}
