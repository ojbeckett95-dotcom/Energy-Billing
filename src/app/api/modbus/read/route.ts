import { withErrorHandling } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { readMeterTCP } from "@/lib/modbus";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const { ip, port, unitId, t1Register, t2Register, registerType, dataType } = await req.json() as { ip: string; port: number; unitId: number; t1Register?: number; t2Register?: number; registerType?: "holding" | "input"; dataType?: "float32" | "float64" | "int16" | "uint16" | "int32" | "uint32" };

  if (!ip) {
    return NextResponse.json({ error: "IP address required" }, { status: 400 });
  }

  const result = await readMeterTCP(ip, port ?? 502, unitId ?? 1, 5000, t1Register, t2Register, registerType, dataType);
  return NextResponse.json(result);
});
