import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { AppData, AuthSettings, BrandingSettings, EmailSettings, MeterReading, SchedulerSettings } from "./types";
import { resolveActiveTariffId } from "./tariff-schedule";


const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "app-data.json");

const DEFAULT_BRANDING: BrandingSettings = {
  companyName: "Your Energy Company",
  companyAddress: "123 Business Street, City, County, AB1 2CD",
  companyPhone: "01234 567890",
  companyEmail: "billing@yourcompany.com",
  companyWebsite: "www.yourcompany.com",
  companyRegistration: "",
  vatNumber: "",
  logoBase64: "",
  primaryColor: "#1e40af",
  secondaryColor: "#1e3a5f",
  accentColor: "#3b82f6",
  footerText: "Thank you for your business. Payment is due within the terms stated above.",
  paymentTermsDays: 14,
  bankName: "",
  bankAccountName: "",
  bankSortCode: "",
  bankAccountNumber: "",
  bankIban: "",
};

const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPassword: "",
  fromAddress: "",
  fromName: "Energy Billing",
  subjectTemplate: "Your Energy Bill - {{billingPeriod}}",
  bodyTemplate: `Dear {{customerName}},

Please find attached your energy bill for {{billingPeriod}}.

Total Due: {{total}}
Due Date: {{dueDate}}

If you have any questions, please do not hesitate to contact us.

Kind regards,
{{companyName}}`,
  autoSendEnabled: false,
  autoSendDay: 1,
  bccAddress: "",
};

const DEFAULT_SCHEDULER_SETTINGS: SchedulerSettings = {
  autoReadingsEnabled: false,
  autoReadingIntervalMinutes: 60,
  autoBillingEnabled: false,
  autoBillingMode: "day-of-month",
  autoBillingDayOfMonth: 1,
  autoBillingIntervalDays: 30,
  autoBillingSendEmail: false,
  autoBillingTimeOfDay: "09:00",
  pdfStoragePath: "",
  serverPort: 3001,
  readingsArchiveMonths: 0,
};

function makeDefaultAuthSettings(): AuthSettings {
  return { sessionSecret: crypto.randomBytes(32).toString("hex") };
}

const DEFAULT_DATA: AppData = {
  customers: [],
  meters: [],
  tariffRates: [],
  meterReadings: [],
  bills: [],
  customerTariffSchedules: [],
  branding: DEFAULT_BRANDING,
  emailSettings: DEFAULT_EMAIL_SETTINGS,
  schedulerSettings: DEFAULT_SCHEDULER_SETTINGS,
  authSettings: makeDefaultAuthSettings(),
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readData(): AppData {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    writeData(DEFAULT_DATA);
    return DEFAULT_DATA;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppData>;
    // Merge with defaults to handle any missing keys
    return {
      customers: parsed.customers ?? [],
      meters: parsed.meters ?? [],
      tariffRates: parsed.tariffRates ?? [],
      meterReadings: parsed.meterReadings ?? [],
      bills: parsed.bills ?? [],
      customerTariffSchedules: parsed.customerTariffSchedules ?? [],
      branding: { ...DEFAULT_BRANDING, ...(parsed.branding ?? {}) },
      emailSettings: { ...DEFAULT_EMAIL_SETTINGS, ...(parsed.emailSettings ?? {}) },
      schedulerSettings: { ...DEFAULT_SCHEDULER_SETTINGS, ...(parsed.schedulerSettings ?? {}) },
      authSettings: { ...makeDefaultAuthSettings(), ...(parsed.authSettings ?? {}) },
    };
  } catch {
    return DEFAULT_DATA;
  }
}

export function writeData(data: AppData): void {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Generates a human-readable bill ID: {accountNumber}-{last5ofSerial}-{DDMMYYYY} */
export function generateBillId(accountNumber: string, serialNumber: string | undefined, date: Date): string {
  const acc = accountNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() || "ACCT";
  const serial = (serialNumber ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(-5).toUpperCase() || "XXXXX";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${acc}-${serial}-${dd}${mm}${yyyy}`;
}

/** Saves PDF bytes to a file in the configured storage directory.
 *  Returns the absolute path of the saved file. */
export function saveBillPDFToFile(billId: string, pdfBytes: Uint8Array, storagePath: string): string {
  const dir = path.isAbsolute(storagePath)
    ? storagePath
    : path.join(process.cwd(), storagePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, `${billId}.pdf`);
  fs.writeFileSync(filePath, pdfBytes);
  return filePath;
}

const ARCHIVE_FILE = path.join(DATA_DIR, "readings-archive.json");

/** Moves readings older than `months` months to a separate archive file.
 *  Returns how many readings were moved and the archive file path. */
export function archiveOldReadings(months: number): { archived: number; archiveFile: string } {
  if (months <= 0) return { archived: 0, archiveFile: "" };

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  const data = readData();
  const toArchive = data.meterReadings.filter(r => r.readingDate.substring(0, 10) < cutoffStr);
  const toKeep   = data.meterReadings.filter(r => r.readingDate.substring(0, 10) >= cutoffStr);

  if (toArchive.length === 0) return { archived: 0, archiveFile: ARCHIVE_FILE };

  // Load existing archive and deduplicate by id
  let existing: MeterReading[] = [];
  if (fs.existsSync(ARCHIVE_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf-8")); } catch { /* ignore */ }
  }
  const existingIds = new Set(existing.map(r => r.id));
  const newEntries  = toArchive.filter(r => !existingIds.has(r.id));

  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify([...existing, ...newEntries], null, 2), "utf-8");

  data.meterReadings = toKeep;
  writeData(data);

  return { archived: newEntries.length, archiveFile: ARCHIVE_FILE };
}

/** Returns the tariff rate ID active for a customer on a given date (YYYY-MM-DD).
 *  Looks at per-customer scheduled changes first, falls back to customer.tariffPlanId. */
export function getActiveTariffId(customerId: string, date: string, data: AppData): string {
  return resolveActiveTariffId(customerId, date, data.customerTariffSchedules, data.customers);
}
