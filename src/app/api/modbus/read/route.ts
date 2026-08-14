import { NextRequest, NextResponse } from "next/server";
import { readMeterTCP } from "@/lib/modbus";
import { requireAuth } from "@/lib/auth-server";

// Hostname / IPv4 / IPv6 literal, no scheme, credentials or path
const HOST_PATTERN = /^[A-Za-z0-9._:-]{1,253}$/;

export async function POST(req: NextRequest) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;

  const { ip, port, unitId, t1Register, t2Register, registerType, dataType } = await req.json() as { ip: string; port: number; unitId: number; t1Register?: number; t2Register?: number; registerType?: "holding" | "input"; dataType?: "float32" | "float64" | "int16" | "uint16" | "int32" | "uint32" };

  if (typeof ip !== "string" || !HOST_PATTERN.test(ip)) {
    return NextResponse.json({ error: "Valid meter host or IP address required" }, { status: 400 });
  }
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    return NextResponse.json({ error: "Port must be an integer between 1 and 65535" }, { status: 400 });
  }
  if (unitId !== undefined && (!Number.isInteger(unitId) || unitId < 1 || unitId > 247)) {
    return NextResponse.json({ error: "Unit ID must be an integer between 1 and 247" }, { status: 400 });
  }

  const result = await readMeterTCP(ip, port ?? 502, unitId ?? 1, 5000, t1Register, t2Register, registerType, dataType);
  return NextResponse.json(result);
}
