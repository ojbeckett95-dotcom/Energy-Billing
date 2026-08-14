import type { Customer, CustomerTariffSchedule } from "./types";

/** Returns the tariff rate ID active for a customer on a given date (YYYY-MM-DD).
 *  Looks at per-customer scheduled changes first, falls back to customer.tariffPlanId.
 *  Pure so it can be shared between the server (AppData) and the client (fetched lists). */
export function resolveActiveTariffId(
  customerId: string,
  date: string,
  schedules: CustomerTariffSchedule[],
  customers: Customer[],
): string {
  const schedule = schedules
    .filter((s) => s.customerId === customerId && s.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (schedule) return schedule.tariffRateId;
  return customers.find((c) => c.id === customerId)?.tariffPlanId ?? "";
}
