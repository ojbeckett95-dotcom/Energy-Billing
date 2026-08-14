import { format } from "date-fns";

/** Formats an amount as GBP, e.g. 12.5 → "£12.50". */
export function formatCurrency(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

/** Formats an ISO date/datetime string as dd/MM/yyyy, falling back to the raw value. */
export function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
}

/** Returns the YYYY-MM-DD part of an ISO date/datetime string. */
export function toDateOnly(dateStr: string): string {
  return dateStr.substring(0, 10);
}

/** Today as YYYY-MM-DD. */
export function todayDateOnly(): string {
  return toDateOnly(new Date().toISOString());
}
