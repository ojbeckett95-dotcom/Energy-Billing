// Core domain types

export interface Customer {
  id: string;
  name: string;
  email: string;
  address: string;
  accountNumber: string;
  tariffPlanId: string;
  createdAt: string;
  notes?: string;
  // Per-customer billing schedule (undefined = inherit global scheduler settings)
  autoBillingEnabled?: boolean;       // false = never auto-bill this customer
  billingMode?: "day-of-month" | "interval-days" | "weekly";
  billingDayOfMonth?: number;         // 1-28, for day-of-month mode
  billingIntervalDays?: number;       // N days, for interval-days mode
  billingDayOfWeek?: number;          // 0=Sun…6=Sat, for weekly mode
  lastAutoBilledAt?: string;          // ISO date — updated after each auto-bill run
}

export type ModbusRegisterType = "holding" | "input";
export type ModbusDataType = "float32" | "float64" | "int16" | "uint16" | "int32" | "uint32";

export interface Meter {
  id: string;
  serialNumber: string;   // physical serial number printed on the meter
  customerId?: string;    // optional — meter can exist unassigned in the registry
  name: string;           // e.g. "Main Supply", "Workshop"
  meterIp: string;
  meterPort: number;
  meterUnitId: number;
  meterT1Register?: number;
  meterT2Register?: number;
  meterT3Register?: number;
  meterT4Register?: number;
  registerType?: ModbusRegisterType; // default "holding"
  dataType?: ModbusDataType;         // default "float32"
  notes?: string;
}

export interface TariffRate {
  id: string;
  name: string;
  effectiveFrom: string; // ISO date string YYYY-MM-DD
  effectiveTo?: string;  // ISO date string, undefined = still active
  tariff1RatePerKwh: number; // £/kWh (up to 6 decimal places)
  tariff2Enabled: boolean;
  tariff2RatePerKwh: number;
  tariff3Enabled?: boolean;
  tariff3RatePerKwh?: number;
  tariff4Enabled?: boolean;
  tariff4RatePerKwh?: number;
  tariff1Label: string;
  tariff2Label: string;
  tariff3Label?: string;
  tariff4Label?: string;
  standingChargePerDay: number; // £/day
  vatRate: number; // percent e.g. 5 or 20
  notes?: string;
}

export interface MeterReading {
  id: string;
  customerId: string;
  meterId?: string;           // optional for backward compat with pre-migration readings
  readingDate: string; // ISO date string
  tariff1Kwh: number;
  tariff2Kwh: number;
  tariff3Kwh?: number;
  tariff4Kwh?: number;
  readMethod: "modbus" | "manual";
  billedInBillId?: string;    // set when this reading is used as a closing reading in a bill
  archived?: boolean;         // hidden from default view; auto-archived after 3 months if billed
  notes?: string;
}

export interface Bill {
  id: string;
  customerId: string;
  meterId?: string;   // optional for backward compat
  tariffRateId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  openingReadingId: string;
  closingReadingId: string;
  tariff1Usage: number; // kWh consumed
  tariff2Usage: number;
  tariff3Usage?: number;
  tariff4Usage?: number;
  tariff1Cost: number;
  tariff2Cost: number;
  tariff3Cost?: number;
  tariff4Cost?: number;
  standingCharge: number;
  subtotal: number;
  vat: number;
  total: number;
  status: "draft" | "sent" | "paid";
  generatedAt: string;
  sentAt?: string;
  pdfBase64?: string;
  pdfFilePath?: string; // absolute path to saved PDF file (used when pdfStoragePath is configured)
  emailError?: string; // set when auto-billing email failed to send
}

export interface BrandingSettings {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  companyRegistration?: string;
  vatNumber?: string;
  logoBase64?: string; // base64 data URL
  primaryColor: string; // hex
  secondaryColor: string; // hex
  accentColor: string; // hex
  footerText: string;
  paymentTermsDays: number;
  bankName?: string;
  bankAccountName?: string;
  bankSortCode?: string;
  bankAccountNumber?: string;
  bankIban?: string;
}

export interface EmailSettings {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  fromAddress: string;
  fromName: string;
  subjectTemplate: string; // supports {{customerName}}, {{billingPeriod}}, {{total}}
  bodyTemplate: string;
  autoSendEnabled: boolean;
  autoSendDay: number; // day of month 1-28
  bccAddress?: string; // BCC all outgoing bill emails to this address
}

export interface SchedulerSettings {
  autoReadingsEnabled: boolean;
  autoReadingIntervalMinutes: number; // default 60 = 1 hour
  lastAutoReadAt?: string; // ISO timestamp of last auto-read run
  autoBillingEnabled: boolean;
  autoBillingMode: "day-of-month" | "interval-days"; // billing schedule mode
  autoBillingDayOfMonth: number; // 1-28, used when mode is "day-of-month"
  autoBillingIntervalDays: number; // used when mode is "interval-days"
  autoBillingSendEmail: boolean; // whether to also email bills after generating
  autoBillingTimeOfDay: string; // "HH:MM" — billing runs at or after this time; default "00:00"
  lastAutoBillingAt?: string; // ISO date of last auto-billing run
  pdfStoragePath: string; // directory to save PDF files; empty = store as base64 in JSON
  serverPort: number; // HTTP port the server listens on (default 3001)
  readingsArchiveMonths: number; // move readings older than this to archive file; 0 = disabled
}

export interface CustomerTariffSchedule {
  id: string;
  customerId: string;
  tariffRateId: string;
  effectiveFrom: string; // YYYY-MM-DD — this tariff is active from this date onwards
  notes?: string;
}

export interface AuthSettings {
  passwordHash?: string;      // scrypt hash of user-set password; undefined = not yet configured
  sessionSecret: string;      // HMAC-SHA256 signing key for session tokens
  recoveryCodeHash?: string;  // scrypt hash of this install's recovery code
}

export interface AppData {
  customers: Customer[];
  meters: Meter[];
  tariffRates: TariffRate[];
  meterReadings: MeterReading[];
  bills: Bill[];
  customerTariffSchedules: CustomerTariffSchedule[];
  branding: BrandingSettings;
  emailSettings: EmailSettings;
  schedulerSettings: SchedulerSettings;
  authSettings: AuthSettings;
}
