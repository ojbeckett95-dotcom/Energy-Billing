import { describe, it, expect } from "vitest";
import zlib from "zlib";
import { PDFDocument, PDFRawStream } from "pdf-lib";
import { generateBillPDF } from "@/lib/pdf-generator";
import type { Bill, BrandingSettings, Customer, Meter, MeterReading, TariffRate } from "@/lib/types";

/** A 1x1 transparent PNG. */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const bill: Bill = {
  id: "acc1-87654-01032025",
  customerId: "c1",
  meterId: "m1",
  tariffRateId: "t1",
  billingPeriodStart: "2025-02-01",
  billingPeriodEnd: "2025-03-01",
  openingReadingId: "r1",
  closingReadingId: "r2",
  tariff1Usage: 100,
  tariff2Usage: 30,
  tariff1Cost: 30,
  tariff2Cost: 3,
  standingCharge: 14,
  subtotal: 47,
  vat: 2.35,
  total: 49.35,
  status: "draft",
  generatedAt: "2025-03-01T00:00:00.000Z",
};

const customer: Customer = {
  id: "c1",
  name: "Acme Ltd",
  email: "acme@example.com",
  address: "1 Road, Town",
  accountNumber: "ACC-1",
  tariffPlanId: "t1",
  createdAt: "2025-01-01T00:00:00.000Z",
};

const tariff: TariffRate = {
  id: "t1",
  name: "Standard Variable",
  effectiveFrom: "2025-01-01",
  tariff1RatePerKwh: 0.3,
  tariff2Enabled: true,
  tariff2RatePerKwh: 0.1,
  tariff1Label: "Day",
  tariff2Label: "Night",
  standingChargePerDay: 0.5,
  vatRate: 5,
};

const branding: BrandingSettings = {
  companyName: "Energy Co",
  companyAddress: "2 Street, City",
  companyPhone: "01234 567890",
  companyEmail: "billing@energy.test",
  companyWebsite: "www.energy.test",
  primaryColor: "#1e40af",
  secondaryColor: "#1e3a5f",
  accentColor: "#3b82f6",
  footerText: "Thanks for your business",
  paymentTermsDays: 14,
};

const openingReading: MeterReading = {
  id: "r1",
  customerId: "c1",
  meterId: "m1",
  readingDate: "2025-02-01",
  tariff1Kwh: 100,
  tariff2Kwh: 50,
  tariff3Kwh: 10,
  tariff4Kwh: 5,
  readMethod: "modbus",
};

const closingReading: MeterReading = {
  ...openingReading,
  id: "r2",
  readingDate: "2025-03-01",
  tariff1Kwh: 200,
  tariff2Kwh: 80,
  tariff3Kwh: 30,
  tariff4Kwh: 11,
};

const meter: Meter = {
  id: "m1",
  serialNumber: "SN-987654",
  name: "Main Supply",
  meterIp: "10.0.0.1",
  meterPort: 502,
  meterUnitId: 1,
};

/** Extracts the text drawn into a pdf-lib generated document. */
async function extractText(pdfBytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(pdfBytes);
  let raw = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    try {
      raw += zlib.inflateSync(Buffer.from(obj.contents)).toString("latin1");
    } catch {
      raw += Buffer.from(obj.contents).toString("latin1");
    }
  }
  return [...raw.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)]
    .map(m => Buffer.from(m[1], "hex").toString("latin1"))
    .join("\n");
}

async function render(overrides: {
  bill?: Partial<Bill>;
  tariff?: Partial<TariffRate>;
  branding?: Partial<BrandingSettings>;
  meter?: Meter | undefined;
} = {}) {
  return generateBillPDF(
    { ...bill, ...overrides.bill },
    customer,
    { ...tariff, ...overrides.tariff },
    { ...branding, ...overrides.branding },
    openingReading,
    closingReading,
    "meter" in overrides ? overrides.meter : meter
  );
}

describe("generateBillPDF", () => {
  it("produces a single A4 page PDF", async () => {
    const bytes = await render();
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 2);
    expect(height).toBeCloseTo(841.89, 2);
  });

  it("renders company, customer and invoice details", async () => {
    const text = await extractText(await render());
    expect(text).toContain("ENERGY INVOICE");
    expect(text).toContain("Energy Co");
    expect(text).toContain("2 Street, City");
    expect(text).toContain("Acme Ltd");
    expect(text).toContain("Account: ACC-1");
    expect(text).toContain("ACC1-87654-01032025"); // invoice number, uppercased
    expect(text).toContain("01/03/2025"); // issue date
    expect(text).toContain("15/03/2025"); // due date = issue + 14 payment term days
    expect(text).toContain("01/02/2025");
    expect(text).toContain("Thanks for your business");
  });

  it("renders readings, charges and totals", async () => {
    const text = await extractText(await render());
    expect(text).toContain("Day (kWh)");
    expect(text).toContain("Night (kWh)");
    expect(text).toContain("Day Energy");
    expect(text).toContain("\u00A30.300000/kWh");
    expect(text).toContain("28 days");
    expect(text).toContain("50.000p/day");
    expect(text).toContain("VAT (5%)");
    expect(text).toContain("TOTAL DUE");
    expect(text).toContain("\u00A349.35");
    expect(text).toContain("Standard Variable");
  });

  it("omits a disabled tariff 2 and includes enabled tariffs 3 and 4", async () => {
    const withoutT2 = await extractText(await render({ tariff: { tariff2Enabled: false } }));
    expect(withoutT2).not.toContain("Night (kWh)");

    const withT34 = await extractText(
      await render({
        tariff: {
          tariff3Enabled: true,
          tariff3RatePerKwh: 0.2,
          tariff3Label: "Peak",
          tariff4Enabled: true,
          tariff4RatePerKwh: 0.4,
          tariff4Label: "Off-Peak",
        },
        bill: { tariff3Usage: 20, tariff3Cost: 4, tariff4Usage: 6, tariff4Cost: 2.4 },
      })
    );
    expect(withT34).toContain("Peak (kWh)");
    expect(withT34).toContain("Off-Peak Energy");
  });

  it("labels tariffs 3 and 4 generically when the tariff has no labels", async () => {
    const text = await extractText(
      await render({ tariff: { tariff3Enabled: true, tariff4Enabled: true } })
    );
    expect(text).toContain("T3 (kWh)");
    expect(text).toContain("T4 (kWh)");
  });

  it("includes meter name and serial only when a meter is supplied", async () => {
    expect(await extractText(await render())).toContain("S/N: SN-987654");
    const withoutMeter = await extractText(await render({ meter: undefined }));
    expect(withoutMeter).not.toContain("S/N:");
    expect(withoutMeter).not.toContain("Main Supply");
  });

  it("adds optional VAT number, registration and bank details when present", async () => {
    const text = await extractText(
      await render({
        branding: {
          vatNumber: "GB123",
          companyRegistration: "12345678",
          bankName: "Test Bank",
          bankAccountName: "Energy Co",
          bankSortCode: "01-02-03",
          bankAccountNumber: "12345678",
          bankIban: "GB00TEST",
        },
      })
    );
    expect(text).toContain("VAT: GB123");
    expect(text).toContain("Reg: 12345678");
    expect(text).toContain("PAYMENT DETAILS");
    expect(text).toContain("Sort Code: 01-02-03");
    expect(text).toContain("IBAN: GB00TEST");
  });

  it("omits the payment details block when no bank account is configured", async () => {
    expect(await extractText(await render())).not.toContain("PAYMENT DETAILS");
  });

  it("shows the tariff end date when the rate has one", async () => {
    const text = await extractText(await render({ tariff: { effectiveTo: "2025-12-31" } }));
    expect(text).toContain("Rates effective from 01/01/2025 to 31/12/2025");
  });

  it("embeds a data-URL logo image", async () => {
    const bytes = await render({ branding: { logoBase64: `data:image/png;base64,${PNG_1PX}` } });
    const doc = await PDFDocument.load(bytes);
    const xObjects = doc.getPage(0).node.normalizedEntries().XObject;
    expect(xObjects.entries().length).toBe(1);
  });

  it("embeds a bare base64 logo without a data-URL prefix", async () => {
    const bytes = await render({ branding: { logoBase64: PNG_1PX } });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPage(0).node.normalizedEntries().XObject.entries().length).toBe(1);
  });

  it("still renders the invoice when the logo cannot be decoded", async () => {
    const bytes = await render({ branding: { logoBase64: "data:image/png;base64,not-an-image" } });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPage(0).node.normalizedEntries().XObject.entries().length).toBe(0);
    expect(await extractText(bytes)).toContain("ENERGY INVOICE");
  });

  it("keeps unparseable dates as-is", async () => {
    const text = await extractText(await render({ bill: { billingPeriodStart: "unknown" } }));
    expect(text).toContain("unknown");
  });
});
