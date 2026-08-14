// Modbus TCP meter reading service
// Works with energy meters that expose 2 tariff registers via Modbus TCP

import type { ModbusRegisterType, ModbusDataType } from "./types";

export interface ModbusReadResult {
  success: boolean;
  tariff1Kwh?: number;
  tariff2Kwh?: number;
  tariff3Kwh?: number;
  tariff4Kwh?: number;
  error?: string;
}

// Register map – common for many DIN-rail energy meters (e.g. Eastron SDM630, Carlo Gavazzi EM24)
// Tariff 1 (Import T1) = holding register 0x0156 (342)
// Tariff 2 (Import T2) = holding register 0x0158 (344)
// Override via METER_T1_REGISTER and METER_T2_REGISTER env vars if needed.
const T1_REG = parseInt(process.env.METER_T1_REGISTER ?? "342", 10);
const T2_REG = parseInt(process.env.METER_T2_REGISTER ?? "344", 10);

// How many 16-bit registers each data type occupies
const REGISTER_COUNT: Record<ModbusDataType, number> = {
  int16:   1,
  uint16:  1,
  float32: 2,
  int32:   2,
  uint32:  2,
  float64: 4,
};

function parseRegisters(data: number[], dataType: ModbusDataType): number {
  const buf = Buffer.alloc(8); // max 4 registers = 8 bytes
  for (let i = 0; i < data.length; i++) {
    buf.writeUInt16BE(data[i], i * 2);
  }
  switch (dataType) {
    case "float32": return buf.readFloatBE(0);
    case "float64": return buf.readDoubleBE(0);
    case "int16":   return buf.readInt16BE(0);
    case "uint16":  return buf.readUInt16BE(0);
    case "int32":   return buf.readInt32BE(0);
    case "uint32":  return buf.readUInt32BE(0);
  }
}

export async function readMeterTCP(
  ip: string,
  port: number,
  unitId: number,
  timeoutMs = 5000,
  t1Register?: number,
  t2Register?: number,
  registerType: ModbusRegisterType = "holding",
  dataType: ModbusDataType = "float32",
  t3Register?: number,
  t4Register?: number,
): Promise<ModbusReadResult> {
  const t1 = t1Register ?? T1_REG;
  const t2 = t2Register ?? T2_REG;
  const count = REGISTER_COUNT[dataType];

  let client: InstanceType<Awaited<typeof import("modbus-serial")>["default"]> | undefined;

  try {
    // Dynamic import to avoid issues on the edge runtime
    const ModbusRTU = (await import("modbus-serial")).default;
    client = new ModbusRTU();
    client.setTimeout(timeoutMs);

    await client.connectTCP(ip, { port });
    client.setID(unitId);

    const readFn = registerType === "input"
      ? client.readInputRegisters.bind(client)
      : client.readHoldingRegisters.bind(client);

    const t1Data = await readFn(t1, count);
    const tariff1Kwh = parseRegisters(t1Data.data, dataType);

    const t2Data = await readFn(t2, count);
    const tariff2Kwh = parseRegisters(t2Data.data, dataType);

    let tariff3Kwh: number | undefined;
    if (t3Register !== undefined) {
      const t3Data = await readFn(t3Register, count);
      tariff3Kwh = Math.round(parseRegisters(t3Data.data, dataType) * 100) / 100;
    }

    let tariff4Kwh: number | undefined;
    if (t4Register !== undefined) {
      const t4Data = await readFn(t4Register, count);
      tariff4Kwh = Math.round(parseRegisters(t4Data.data, dataType) * 100) / 100;
    }

    return {
      success: true,
      tariff1Kwh: Math.round(tariff1Kwh * 100) / 100,
      tariff2Kwh: Math.round(tariff2Kwh * 100) / 100,
      ...(tariff3Kwh !== undefined && { tariff3Kwh }),
      ...(tariff4Kwh !== undefined && { tariff4Kwh }),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown Modbus error",
    };
  } finally {
    // Close on every path so a failed read cannot leak the socket
    try {
      client?.close(() => {});
    } catch (err) {
      console.error(`[modbus] Could not close connection to ${ip}:${port}:`, err);
    }
  }
}
