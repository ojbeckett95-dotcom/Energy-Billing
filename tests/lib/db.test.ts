import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { AppData, MeterReading } from "@/lib/types";

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "eb-db-"));
process.env.DATA_DIR = DATA_DIR;

const {
  readData,
  writeData,
  generateId,
  generateBillId,
  saveBillPDFToFile,
  archiveOldReadings,
  getActiveTariffId,
} = await import("@/lib/db");

const DATA_FILE = path.join(DATA_DIR, "app-data.json");
const ARCHIVE_FILE = path.join(DATA_DIR, "readings-archive.json");

function reading(id: string, readingDate: string): MeterReading {
  return {
    id,
    customerId: "c1",
    meterId: "m1",
    readingDate,
    tariff1Kwh: 10,
    tariff2Kwh: 5,
    readMethod: "manual",
  };
}

function isoMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

beforeEach(() => {
  fs.rmSync(DATA_FILE, { force: true });
  fs.rmSync(ARCHIVE_FILE, { force: true });
});

afterAll(() => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

describe("readData / writeData", () => {
  it("creates the data file with defaults when missing", () => {
    const data = readData();
    expect(fs.existsSync(DATA_FILE)).toBe(true);
    expect(data.customers).toEqual([]);
    expect(data.branding.companyName).toBe("Your Energy Company");
    expect(data.schedulerSettings.serverPort).toBe(3001);
    expect(data.authSettings.sessionSecret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("round-trips written data", () => {
    // cloned: readData() returns the shared defaults object when no file exists yet
    const data = structuredClone(readData());
    data.customers.push({
      id: "c1",
      name: "Acme",
      email: "a@example.com",
      address: "1 Road",
      accountNumber: "ACC-1",
      tariffPlanId: "t1",
      createdAt: "2025-01-01T00:00:00.000Z",
    });
    writeData(data);
    expect(readData().customers).toHaveLength(1);
    expect(readData().customers[0].name).toBe("Acme");
  });

  it("merges partial settings with defaults and fills missing collections", () => {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ branding: { companyName: "Custom Co" }, emailSettings: { smtpHost: "smtp.test" } }),
      "utf-8"
    );
    const data = readData();
    expect(data.branding.companyName).toBe("Custom Co");
    expect(data.branding.paymentTermsDays).toBe(14);
    expect(data.emailSettings.smtpHost).toBe("smtp.test");
    expect(data.emailSettings.smtpPort).toBe(587);
    expect(data.meters).toEqual([]);
    expect(data.bills).toEqual([]);
  });

  it("falls back to defaults when the data file is corrupt", () => {
    fs.writeFileSync(DATA_FILE, "{ not json", "utf-8");
    expect(readData().customers).toEqual([]);
  });
});

describe("generateId", () => {
  it("returns unique lowercase alphanumeric ids", () => {
    const ids = new Set(Array.from({ length: 200 }, generateId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]+$/);
  });
});

describe("generateBillId", () => {
  const date = new Date(2025, 2, 7); // 07/03/2025

  it("formats account, last 5 serial chars and DDMMYYYY", () => {
    expect(generateBillId("ACC-001", "SN-123456789", date)).toBe("ACC001-56789-07032025");
  });

  it("strips non-alphanumeric characters and uppercases", () => {
    expect(generateBillId("acc/1 2", "ab-cd", date)).toBe("ACC12-ABCD-07032025");
  });

  it("uses placeholders when account or serial contain no usable characters", () => {
    expect(generateBillId("", undefined, date)).toBe("ACCT-XXXXX-07032025");
    expect(generateBillId("!!!", "###", date)).toBe("ACCT-XXXXX-07032025");
  });

  it("zero-pads single digit days and months", () => {
    expect(generateBillId("A", "B", new Date(2025, 0, 1))).toBe("A-B-01012025");
  });
});

describe("saveBillPDFToFile", () => {
  it("writes the PDF into an absolute storage directory", () => {
    const dir = path.join(DATA_DIR, "pdfs");
    const filePath = saveBillPDFToFile("BILL-1", new Uint8Array([1, 2, 3]), dir);
    expect(filePath).toBe(path.join(dir, "BILL-1.pdf"));
    expect(Array.from(fs.readFileSync(filePath))).toEqual([1, 2, 3]);
  });

  it("resolves relative storage paths against the working directory", () => {
    const rel = path.relative(process.cwd(), path.join(DATA_DIR, "rel-pdfs"));
    const filePath = saveBillPDFToFile("BILL-2", new Uint8Array([9]), rel);
    expect(filePath).toBe(path.join(process.cwd(), rel, "BILL-2.pdf"));
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

describe("archiveOldReadings", () => {
  function seedReadings(readings: MeterReading[]): AppData {
    const data = structuredClone(readData());
    data.meterReadings = readings;
    writeData(data);
    return data;
  }

  it("is a no-op when months is zero or negative", () => {
    seedReadings([reading("r1", isoMonthsAgo(24))]);
    expect(archiveOldReadings(0)).toEqual({ archived: 0, archiveFile: "" });
    expect(archiveOldReadings(-1)).toEqual({ archived: 0, archiveFile: "" });
    expect(readData().meterReadings).toHaveLength(1);
  });

  it("moves readings older than the cutoff out of the data file", () => {
    seedReadings([reading("old", isoMonthsAgo(6)), reading("recent", isoMonthsAgo(1))]);
    const result = archiveOldReadings(3);
    expect(result.archived).toBe(1);
    expect(result.archiveFile).toBe(ARCHIVE_FILE);
    expect(readData().meterReadings.map(r => r.id)).toEqual(["recent"]);
    expect(JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf-8")).map((r: MeterReading) => r.id)).toEqual(["old"]);
  });

  it("appends to an existing archive and skips ids already archived", () => {
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify([reading("old", isoMonthsAgo(6))]), "utf-8");
    seedReadings([reading("old", isoMonthsAgo(6)), reading("older", isoMonthsAgo(9))]);
    const result = archiveOldReadings(3);
    expect(result.archived).toBe(1);
    const archived = JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf-8")) as MeterReading[];
    expect(archived.map(r => r.id)).toEqual(["old", "older"]);
    expect(readData().meterReadings).toEqual([]);
  });

  it("reports nothing archived when all readings are inside the retention window", () => {
    seedReadings([reading("recent", isoMonthsAgo(1))]);
    expect(archiveOldReadings(3)).toEqual({ archived: 0, archiveFile: ARCHIVE_FILE });
    expect(readData().meterReadings).toHaveLength(1);
  });

  it("recovers from a corrupt archive file by rewriting it", () => {
    fs.writeFileSync(ARCHIVE_FILE, "not json", "utf-8");
    seedReadings([reading("old", isoMonthsAgo(6))]);
    expect(archiveOldReadings(3).archived).toBe(1);
    expect(JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf-8"))).toHaveLength(1);
  });
});

describe("getActiveTariffId", () => {
  const data = {
    customers: [
      { id: "c1", tariffPlanId: "plan-a" },
      { id: "c2", tariffPlanId: "plan-b" },
      { id: "c3" },
    ],
    customerTariffSchedules: [
      { id: "s1", customerId: "c1", tariffRateId: "sched-old", effectiveFrom: "2025-01-01" },
      { id: "s2", customerId: "c1", tariffRateId: "sched-new", effectiveFrom: "2025-06-01" },
      { id: "s3", customerId: "c2", tariffRateId: "other", effectiveFrom: "2025-01-01" },
    ],
  } as unknown as AppData;

  it("picks the latest schedule effective on or before the date", () => {
    expect(getActiveTariffId("c1", "2025-06-01", data)).toBe("sched-new");
    expect(getActiveTariffId("c1", "2025-12-31", data)).toBe("sched-new");
    expect(getActiveTariffId("c1", "2025-03-15", data)).toBe("sched-old");
  });

  it("falls back to the customer's tariff plan when no schedule applies yet", () => {
    expect(getActiveTariffId("c1", "2024-12-31", data)).toBe("plan-a");
  });

  it("ignores schedules belonging to other customers", () => {
    expect(getActiveTariffId("c2", "2024-01-01", data)).toBe("plan-b");
  });

  it("returns an empty string for unknown customers or missing tariff plans", () => {
    expect(getActiveTariffId("nope", "2025-06-01", data)).toBe("");
    expect(getActiveTariffId("c3", "2025-06-01", data)).toBe("");
  });
});
