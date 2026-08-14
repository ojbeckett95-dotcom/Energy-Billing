import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";
import type { AppData, Bill, Customer, MeterReading, TariffRate } from "@/lib/types";

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "eb-bills-"));
process.env.DATA_DIR = DATA_DIR;

// The PDF pipeline is exercised separately; here we only care about the billing maths.
vi.mock("@/lib/pdf-generator", () => ({
  generateBillPDF: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));

const { POST, GET, DELETE } = await import("@/app/api/bills/route");
const { readData, writeData } = await import("@/lib/db");

const customer: Customer = {
  id: "c1",
  name: "Acme",
  email: "acme@example.com",
  address: "1 Road",
  accountNumber: "ACC-1",
  tariffPlanId: "t1",
  createdAt: "2025-01-01T00:00:00.000Z",
};

const tariff: TariffRate = {
  id: "t1",
  name: "Standard",
  effectiveFrom: "2025-01-01",
  tariff1RatePerKwh: 0.3,
  tariff2Enabled: true,
  tariff2RatePerKwh: 0.1,
  tariff1Label: "Day",
  tariff2Label: "Night",
  standingChargePerDay: 0.5,
  vatRate: 5,
};

function reading(id: string, date: string, kwh: Partial<MeterReading>): MeterReading {
  return {
    id,
    customerId: "c1",
    meterId: "m1",
    readingDate: date,
    tariff1Kwh: 0,
    tariff2Kwh: 0,
    readMethod: "modbus",
    ...kwh,
  };
}

function seed(overrides: Partial<AppData> = {}) {
  const data = structuredClone(readData());
  data.customers = [customer, { ...customer, id: "c2", accountNumber: "ACC-2" }];
  data.meters = [
    { id: "m1", serialNumber: "SN-987654", name: "Main", meterIp: "10.0.0.1", meterPort: 502, meterUnitId: 1 },
    { id: "m2", serialNumber: "SN-111222", name: "Workshop", meterIp: "10.0.0.2", meterPort: 502, meterUnitId: 1 },
  ];
  data.tariffRates = [tariff];
  data.meterReadings = [
    reading("r1", "2025-02-01", { tariff1Kwh: 100, tariff2Kwh: 50, tariff3Kwh: 10, tariff4Kwh: 5 }),
    reading("r2", "2025-02-15", { tariff1Kwh: 150, tariff2Kwh: 70, tariff3Kwh: 20, tariff4Kwh: 8 }),
    reading("r3", "2025-03-01", { tariff1Kwh: 200, tariff2Kwh: 80, tariff3Kwh: 30, tariff4Kwh: 11 }),
    reading("r4", "2025-03-10", { tariff1Kwh: 260, tariff2Kwh: 95 }),
    reading("r5", "2025-02-01", { customerId: "c2", meterId: "m2", tariff1Kwh: 10, tariff2Kwh: 0 }),
    reading("r6", "2025-03-01", { customerId: "c2", meterId: "m2", tariff1Kwh: 40, tariff2Kwh: 0 }),
  ];
  data.bills = [];
  Object.assign(data, overrides);
  writeData(data);
  return data;
}

function postRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/bills", { method: "POST", body: JSON.stringify(body) });
}

const validBody = {
  customerId: "c1",
  meterId: "m1",
  tariffRateId: "t1",
  billingPeriodStart: "2025-02-01",
  billingPeriodEnd: "2025-03-01",
  openingReadingId: "r1",
  closingReadingId: "r3",
};

beforeEach(() => {
  fs.rmSync(path.join(DATA_DIR, "app-data.json"), { force: true });
  seed();
});

describe("POST /api/bills", () => {
  it("computes usage, costs, standing charge, VAT and total", async () => {
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(201);
    const bill = (await res.json()) as Bill;

    expect(bill.tariff1Usage).toBe(100); // 200 - 100
    expect(bill.tariff2Usage).toBe(30); // 80 - 50
    expect(bill.tariff1Cost).toBeCloseTo(30, 6);
    expect(bill.tariff2Cost).toBeCloseTo(3, 6);
    expect(bill.standingCharge).toBeCloseTo(14, 6); // 28 days x £0.50
    expect(bill.subtotal).toBeCloseTo(47, 6);
    expect(bill.vat).toBeCloseTo(2.35, 6);
    expect(bill.total).toBeCloseTo(49.35, 6);
    expect(bill.status).toBe("draft");
    expect(bill.id).toMatch(/^ACC1-87654-\d{8}$/);
  });

  it("clamps negative usage to zero when a meter has been reset", async () => {
    const res = await POST(postRequest({ ...validBody, openingReadingId: "r3", closingReadingId: "r1" }));
    const bill = (await res.json()) as Bill;
    expect(bill.tariff1Usage).toBe(0);
    expect(bill.tariff2Usage).toBe(0);
    expect(bill.tariff1Cost).toBe(0);
  });

  it("bills tariff 2 as zero when the tariff has it disabled", async () => {
    seed({ tariffRates: [{ ...tariff, tariff2Enabled: false }] });
    const bill = (await (await POST(postRequest(validBody))).json()) as Bill;
    expect(bill.tariff2Usage).toBe(0);
    expect(bill.tariff2Cost).toBe(0);
    expect(bill.subtotal).toBeCloseTo(44, 6);
  });

  it("includes tariff 3 and 4 only when enabled on the tariff", async () => {
    const withoutT34 = (await (await POST(postRequest(validBody))).json()) as Bill;
    expect(withoutT34.tariff3Usage).toBeUndefined();
    expect(withoutT34.tariff4Usage).toBeUndefined();

    seed({
      tariffRates: [
        {
          ...tariff,
          tariff3Enabled: true,
          tariff3RatePerKwh: 0.2,
          tariff4Enabled: true,
          tariff4RatePerKwh: 0.4,
        },
      ],
    });
    const withT34 = (await (await POST(postRequest(validBody))).json()) as Bill;
    expect(withT34.tariff3Usage).toBe(20); // 30 - 10
    expect(withT34.tariff4Usage).toBe(6); // 11 - 5
    expect(withT34.tariff3Cost).toBeCloseTo(4, 6);
    expect(withT34.tariff4Cost).toBeCloseTo(2.4, 6);
    expect(withT34.subtotal).toBeCloseTo(53.4, 6);
  });

  it("treats missing tariff 3 and 4 readings as zero usage", async () => {
    seed({
      tariffRates: [{ ...tariff, tariff3Enabled: true, tariff3RatePerKwh: 0.2 }],
    });
    const bill = (await (await POST(postRequest({ ...validBody, closingReadingId: "r4" }))).json()) as Bill;
    expect(bill.tariff3Usage).toBe(0);
    expect(bill.tariff3Cost).toBe(0);
  });

  it("stores the PDF as base64 when no storage path is configured", async () => {
    const bill = (await (await POST(postRequest(validBody))).json()) as Bill;
    expect(bill.pdfBase64).toBe(Buffer.from([37, 80, 68, 70]).toString("base64"));
    expect(bill.pdfFilePath).toBeUndefined();
  });

  it("writes the PDF to disk when a storage path is configured", async () => {
    const pdfDir = path.join(DATA_DIR, "pdf-out");
    const data = seed();
    data.schedulerSettings = { ...data.schedulerSettings, pdfStoragePath: pdfDir };
    writeData(data);

    const bill = (await (await POST(postRequest(validBody))).json()) as Bill;
    expect(bill.pdfBase64).toBeUndefined();
    expect(bill.pdfFilePath).toBe(path.join(pdfDir, `${bill.id}.pdf`));
    expect(fs.existsSync(bill.pdfFilePath!)).toBe(true);
  });

  it("still returns a bill when PDF generation fails", async () => {
    const { generateBillPDF } = await import("@/lib/pdf-generator");
    vi.mocked(generateBillPDF).mockRejectedValueOnce(new Error("pdf boom"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(201);
    const bill = (await res.json()) as Bill;
    expect(bill.pdfBase64).toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("marks every reading in the period for the billed meter", async () => {
    const bill = (await (await POST(postRequest(validBody))).json()) as Bill;
    const billed = Object.fromEntries(readData().meterReadings.map(r => [r.id, r.billedInBillId]));
    expect(billed).toEqual({
      r1: bill.id,
      r2: bill.id,
      r3: bill.id,
      r4: undefined,
      r5: undefined,
      r6: undefined,
    });
  });

  it("scopes billed readings to the customer when no meter is given", async () => {
    const bodyWithoutMeter = { ...validBody, meterId: undefined };
    const bill = (await (await POST(postRequest(bodyWithoutMeter))).json()) as Bill;
    expect(bill.meterId).toBeUndefined();
    const readings = readData().meterReadings;
    expect(readings.find(r => r.id === "r2")?.billedInBillId).toBe(bill.id);
    expect(readings.find(r => r.id === "r5")?.billedInBillId).toBeUndefined();
  });

  it("persists the generated bill", async () => {
    const bill = (await (await POST(postRequest(validBody))).json()) as Bill;
    expect(readData().bills.map(b => b.id)).toEqual([bill.id]);
  });

  it.each([
    [{ customerId: "missing" }, "Customer not found"],
    [{ tariffRateId: "missing" }, "Tariff not found"],
    [{ openingReadingId: "missing" }, "Opening reading not found"],
    [{ closingReadingId: "missing" }, "Closing reading not found"],
  ])("returns 404 for %o", async (override, error) => {
    const res = await POST(postRequest({ ...validBody, ...override }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error });
    expect(readData().bills).toEqual([]);
  });
});

describe("GET /api/bills", () => {
  function seedBills() {
    const data = seed();
    data.bills = [
      { ...({} as Bill), id: "b1", customerId: "c1", generatedAt: "2025-01-01T00:00:00.000Z" },
      { ...({} as Bill), id: "b2", customerId: "c1", generatedAt: "2025-03-01T00:00:00.000Z" },
      { ...({} as Bill), id: "b3", customerId: "c2", generatedAt: "2025-02-01T00:00:00.000Z" },
    ];
    writeData(data);
  }

  it("returns all bills newest first", async () => {
    seedBills();
    const res = await GET(new NextRequest("http://localhost/api/bills"));
    expect(((await res.json()) as Bill[]).map(b => b.id)).toEqual(["b2", "b3", "b1"]);
  });

  it("filters by customerId", async () => {
    seedBills();
    const res = await GET(new NextRequest("http://localhost/api/bills?customerId=c1"));
    expect(((await res.json()) as Bill[]).map(b => b.id)).toEqual(["b2", "b1"]);
  });
});

describe("DELETE /api/bills", () => {
  function deleteRequest(body: unknown) {
    return new NextRequest("http://localhost/api/bills", { method: "DELETE", body: JSON.stringify(body) });
  }

  it("deletes the bills, their PDF files and the readings' billed markers", async () => {
    const pdfDir = path.join(DATA_DIR, "pdf-delete");
    const data = seed();
    data.schedulerSettings = { ...data.schedulerSettings, pdfStoragePath: pdfDir };
    writeData(data);
    const bill = (await (await POST(postRequest(validBody))).json()) as Bill;
    expect(fs.existsSync(bill.pdfFilePath!)).toBe(true);

    const res = await DELETE(deleteRequest({ ids: [bill.id] }));
    expect(await res.json()).toEqual({ success: true, deleted: 1 });
    const after = readData();
    expect(after.bills).toEqual([]);
    expect(after.meterReadings.every(r => r.billedInBillId === undefined)).toBe(true);
    expect(fs.existsSync(bill.pdfFilePath!)).toBe(false);
  });

  it("leaves other bills and their markers untouched", async () => {
    const first = (await (await POST(postRequest(validBody))).json()) as Bill;
    const second = (await (
      await POST(
        postRequest({ ...validBody, customerId: "c2", meterId: "m2", openingReadingId: "r5", closingReadingId: "r6" })
      )
    ).json()) as Bill;

    await DELETE(deleteRequest({ ids: [first.id] }));
    const after = readData();
    expect(after.bills.map(b => b.id)).toEqual([second.id]);
    expect(after.meterReadings.find(r => r.id === "r6")?.billedInBillId).toBe(second.id);
  });

  it("rejects a request without ids", async () => {
    const res = await DELETE(deleteRequest({ ids: [] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "ids array required" });
  });
});
