import { NextRequest, NextResponse } from "next/server";
import { readData } from "@/lib/db";
import { readMeterTCP } from "@/lib/modbus";
import { withAuth } from "@/lib/auth-server";
import { parseBody, modbusReadSchema } from "@/lib/validation";

// Reads a meter over Modbus TCP. Authentication is required because the target host is
// caller-supplied (the settings page tests meters that aren't saved yet), so this would
// otherwise let an unauthenticated caller probe the local network.
export const POST = withAuth(async (req: NextRequest) => {
  const parsed = await parseBody(req, modbusReadSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const meters = readData().meters;
  const meter = body.meterId ? meters.find(m => m.id === body.meterId) : undefined;
  if (body.meterId && !meter) {
    return NextResponse.json({ error: "Meter not found" }, { status: 404 });
  }

  const ip = meter?.meterIp ?? body.ip;
  if (!ip) return NextResponse.json({ error: "IP address required" }, { status: 400 });

  const result = await readMeterTCP(
    ip,
    body.port ?? meter?.meterPort ?? 502,
    body.unitId ?? meter?.meterUnitId ?? 1,
    5000,
    body.t1Register ?? meter?.meterT1Register,
    body.t2Register ?? meter?.meterT2Register,
    body.registerType ?? meter?.registerType,
    body.dataType ?? meter?.dataType,
    meter?.meterT3Register,
    meter?.meterT4Register,
  );
  return NextResponse.json(result);
});
