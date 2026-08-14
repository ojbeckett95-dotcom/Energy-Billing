// Dates and times follow the locale and timezone of the machine the app runs on:
// in the browser that is the OS locale via Electron, and on the server (PDFs, emails)
// it is the locale of the installed machine.

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | number | Date): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString(undefined, { dateStyle: "short" }) : String(value);
}

export function formatDateTime(value: string | number | Date): string {
  const date = toDate(value);
  return date ? date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : String(value);
}
