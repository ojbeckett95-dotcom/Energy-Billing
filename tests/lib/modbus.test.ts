import { describe, it, expect, beforeEach, vi } from "vitest";

const setTimeoutMock = vi.fn();
const connectTCP = vi.fn(async () => {});
const setID = vi.fn();
const close = vi.fn((cb: () => void) => cb());
type ReadFn = (addr: number, count: number) => Promise<{ data: number[] }>;
const readHoldingRegisters = vi.fn<ReadFn>(async () => ({ data: [0, 0] }));
const readInputRegisters = vi.fn<ReadFn>(async () => ({ data: [0, 0] }));

class FakeModbusRTU {
  setTimeout = setTimeoutMock;
  connectTCP = connectTCP;
  setID = setID;
  close = close;
  readHoldingRegisters = readHoldingRegisters;
  readInputRegisters = readInputRegisters;
}

vi.mock("modbus-serial", () => ({ default: FakeModbusRTU }));

const { readMeterTCP } = await import("@/lib/modbus");

/** 16-bit register words that a meter would return for `value` in `dataType`. */
function words(value: number, dataType: "float32" | "float64" | "int16" | "uint16" | "int32" | "uint32"): number[] {
  const buf = Buffer.alloc(8);
  switch (dataType) {
    case "float32": buf.writeFloatBE(value, 0); return [buf.readUInt16BE(0), buf.readUInt16BE(2)];
    case "float64": buf.writeDoubleBE(value, 0); return [0, 1, 2, 3].map(i => buf.readUInt16BE(i * 2));
    case "int16": buf.writeInt16BE(value, 0); return [buf.readUInt16BE(0)];
    case "uint16": buf.writeUInt16BE(value, 0); return [buf.readUInt16BE(0)];
    case "int32": buf.writeInt32BE(value, 0); return [buf.readUInt16BE(0), buf.readUInt16BE(2)];
    case "uint32": buf.writeUInt32BE(value, 0); return [buf.readUInt16BE(0), buf.readUInt16BE(2)];
  }
}

/** Queues one response per sequential register read. */
function queueReads(values: number[][], fn = readHoldingRegisters) {
  for (const data of values) fn.mockResolvedValueOnce({ data });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readMeterTCP", () => {
  it("connects with the given address, port, unit id and timeout", async () => {
    queueReads([words(1, "float32"), words(2, "float32")]);
    const result = await readMeterTCP("10.0.0.5", 5020, 7, 1234);
    expect(result.success).toBe(true);
    expect(setTimeoutMock).toHaveBeenCalledWith(1234);
    expect(connectTCP).toHaveBeenCalledWith("10.0.0.5", { port: 5020 });
    expect(setID).toHaveBeenCalledWith(7);
    expect(close).toHaveBeenCalled();
  });

  it("reads the default holding registers when none are supplied", async () => {
    queueReads([words(1, "float32"), words(2, "float32")]);
    await readMeterTCP("10.0.0.5", 502, 1);
    expect(readHoldingRegisters.mock.calls.map(c => c[0])).toEqual([342, 344]);
    expect(readInputRegisters).not.toHaveBeenCalled();
  });

  it("reads the supplied registers and rounds values to 2 decimals", async () => {
    queueReads([words(123.456, "float32"), words(78.9, "float32")]);
    const result = await readMeterTCP("1.2.3.4", 502, 1, 5000, 100, 200);
    expect(readHoldingRegisters.mock.calls.map(c => c[0])).toEqual([100, 200]);
    expect(result).toEqual({ success: true, tariff1Kwh: 123.46, tariff2Kwh: 78.9 });
  });

  it("reads tariff 3 and 4 only when their registers are given", async () => {
    queueReads([
      words(1.111, "float32"),
      words(2.222, "float32"),
      words(3.333, "float32"),
      words(4.444, "float32"),
    ]);
    const result = await readMeterTCP("1.2.3.4", 502, 1, 5000, 100, 200, "holding", "float32", 300, 400);
    expect(readHoldingRegisters.mock.calls.map(c => c[0])).toEqual([100, 200, 300, 400]);
    expect(result).toEqual({ success: true, tariff1Kwh: 1.11, tariff2Kwh: 2.22, tariff3Kwh: 3.33, tariff4Kwh: 4.44 });

    queueReads([words(1, "float32"), words(2, "float32"), words(3, "float32")]);
    const t3Only = await readMeterTCP("1.2.3.4", 502, 1, 5000, 100, 200, "holding", "float32", 300);
    expect(t3Only).toEqual({ success: true, tariff1Kwh: 1, tariff2Kwh: 2, tariff3Kwh: 3 });
    expect("tariff4Kwh" in t3Only).toBe(false);
  });

  it("uses input registers when the register type is input", async () => {
    queueReads([words(5, "float32"), words(6, "float32")], readInputRegisters);
    const result = await readMeterTCP("1.2.3.4", 502, 1, 5000, 10, 20, "input");
    expect(readInputRegisters.mock.calls.map(c => c[0])).toEqual([10, 20]);
    expect(readHoldingRegisters).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, tariff1Kwh: 5, tariff2Kwh: 6 });
  });

  it.each([
    ["float32", 1, 12.34, 56.78, 12.34, 56.78],
    ["float64", 2, 12.34, 56.78, 12.34, 56.78],
    ["int16", 1, -1234, 4321, -1234, 4321],
    ["uint16", 1, 1234, 65535, 1234, 65535],
    ["int32", 2, -123456, 123456, -123456, 123456],
    ["uint32", 2, 4000000000, 12, 4000000000, 12],
  ] as const)("decodes %s registers", async (dataType, _i, v1, v2, e1, e2) => {
    queueReads([words(v1, dataType), words(v2, dataType)]);
    const result = await readMeterTCP("1.2.3.4", 502, 1, 5000, 10, 20, "holding", dataType);
    expect(result).toEqual({ success: true, tariff1Kwh: e1, tariff2Kwh: e2 });
  });

  it.each([
    ["float32", 2],
    ["float64", 4],
    ["int16", 1],
    ["uint16", 1],
    ["int32", 2],
    ["uint32", 2],
  ] as const)("requests the right register count for %s", async (dataType, count) => {
    queueReads([words(1, dataType), words(1, dataType)]);
    await readMeterTCP("1.2.3.4", 502, 1, 5000, 10, 20, "holding", dataType);
    expect(readHoldingRegisters.mock.calls.map(c => c[1])).toEqual([count, count]);
  });

  it("returns the failure reason when connecting fails", async () => {
    connectTCP.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(readMeterTCP("1.2.3.4", 502, 1)).resolves.toEqual({ success: false, error: "ECONNREFUSED" });
  });

  it("returns the failure reason when a register read fails", async () => {
    readHoldingRegisters.mockRejectedValueOnce(new Error("Timed out"));
    await expect(readMeterTCP("1.2.3.4", 502, 1)).resolves.toEqual({ success: false, error: "Timed out" });
  });

  it("falls back to a generic message for non-Error failures", async () => {
    connectTCP.mockRejectedValueOnce("nope");
    await expect(readMeterTCP("1.2.3.4", 502, 1)).resolves.toEqual({
      success: false,
      error: "Unknown Modbus error",
    });
  });
});
