import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { AppData, AuthSettings, BrandingSettings, EmailSettings, MeterReading, SchedulerSettings } from "./types";


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
  allowNetworkAccess: false,
  readingsArchiveMonths: 0,
};

function makeDefaultAuthSettings(): AuthSettings {
  return { sessionSecret: crypto.randomBytes(32).toString("hex") };
}

/** Every call returns a fresh object graph, so callers can never mutate shared defaults. */
function makeDefaultData(): AppData {
  return {
    customers: [],
    meters: [],
    tariffRates: [],
    meterReadings: [],
    bills: [],
    customerTariffSchedules: [],
    branding: { ...DEFAULT_BRANDING },
    emailSettings: { ...DEFAULT_EMAIL_SETTINGS },
    schedulerSettings: { ...DEFAULT_SCHEDULER_SETTINGS },
    authSettings: makeDefaultAuthSettings(),
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export class DataCorruptError extends Error {
  constructor(readonly quarantineFile: string, cause: unknown) {
    super(
      `${DATA_FILE} could not be parsed and was moved to ${quarantineFile}. ` +
      `Restore a backup or repair that file, then restart.`,
      { cause }
    );
    this.name = "DataCorruptError";
  }
}

/** Moves an unreadable data file aside so a later write cannot silently destroy it. */
function quarantine(err: unknown): never {
  const target = `${DATA_FILE}.corrupt-${Date.now()}`;
  try { fs.renameSync(DATA_FILE, target); } catch { /* keep the original error */ }
  throw new DataCorruptError(target, err);
}

export function readData(): AppData {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    const fresh = makeDefaultData();
    writeData(fresh);
    return fresh;
  }

  let parsed: Partial<AppData>;
  try {
    parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as Partial<AppData>;
  } catch (err) {
    quarantine(err);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    quarantine(new Error("data file does not contain a JSON object"));
  }

  const defaults = makeDefaultData();
  // Merge with defaults to handle any missing keys
  return {
    customers: parsed.customers ?? [],
    meters: parsed.meters ?? [],
    tariffRates: parsed.tariffRates ?? [],
    meterReadings: parsed.meterReadings ?? [],
    bills: parsed.bills ?? [],
    customerTariffSchedules: parsed.customerTariffSchedules ?? [],
    branding: { ...defaults.branding, ...(parsed.branding ?? {}) },
    emailSettings: { ...defaults.emailSettings, ...(parsed.emailSettings ?? {}) },
    schedulerSettings: { ...defaults.schedulerSettings, ...(parsed.schedulerSettings ?? {}) },
    authSettings: { ...defaults.authSettings, ...(parsed.authSettings ?? {}) },
  };
}

/** Writes via a temp file + rename so a crash mid-write cannot truncate the data file. */
export function writeData(data: AppData): void {
  ensureDataDir();
  const tmp = path.join(DATA_DIR, `.app-data.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, 2), "utf-8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* best effort */ }
    throw err;
  }
}

/** Read–modify–write under an exclusive lock, so concurrent writers (app + scheduler)
 *  cannot overwrite each other's changes with a stale snapshot. */
export function updateData<T>(mutate: (data: AppData) => T): T {
  ensureDataDir();
  const release = acquireLock();
  try {
    const data = readData();
    const result = mutate(data);
    writeData(data);
    return result;
  } finally {
    release();
  }
}

const LOCK_FILE = path.join(DATA_DIR, "app-data.lock");
const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 10_000;

function acquireLock(): () => void {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      const fd = fs.openSync(LOCK_FILE, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return () => { try { fs.unlinkSync(LOCK_FILE); } catch { /* already gone */ } };
    } catch {
      // Reclaim a lock left behind by a process that died mid-write.
      try {
        if (Date.now() - fs.statSync(LOCK_FILE).mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(LOCK_FILE);
          continue;
        }
      } catch { /* lock vanished, retry */ }

      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${LOCK_FILE}`);
      // Busy-wait briefly: all callers here are synchronous.
      const until = Date.now() + 25;
      while (Date.now() < until) { /* spin */ }
    }
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Generates a human-readable bill ID: {accountNumber}-{last5ofSerial}-{DDMMYYYY},
 *  suffixed with -2, -3, … when that ID is already taken. */
export function generateBillId(
  accountNumber: string,
  serialNumber: string | undefined,
  date: Date,
  takenIds: Iterable<string> = []
): string {
  const acc = accountNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() || "ACCT";
  const serial = (serialNumber ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(-5).toUpperCase() || "XXXXX";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const base = `${acc}-${serial}-${dd}${mm}${yyyy}`;

  const taken = new Set(takenIds);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
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

  const archiveTmp = `${ARCHIVE_FILE}.tmp`;
  fs.writeFileSync(archiveTmp, JSON.stringify([...existing, ...newEntries], null, 2), "utf-8");
  fs.renameSync(archiveTmp, ARCHIVE_FILE);

  data.meterReadings = toKeep;
  writeData(data);

  return { archived: newEntries.length, archiveFile: ARCHIVE_FILE };
}

/** Returns the tariff rate ID active for a customer on a given date (YYYY-MM-DD).
 *  Looks at per-customer scheduled changes first, falls back to customer.tariffPlanId. */
export function getActiveTariffId(customerId: string, date: string, data: AppData): string {
  const schedule = data.customerTariffSchedules
    .filter(s => s.customerId === customerId && s.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (schedule) return schedule.tariffRateId;
  return data.customers.find(c => c.id === customerId)?.tariffPlanId ?? "";
}
