import type { Bill, MeterReading } from "./types";

/** Sentinel values stored in `billedInBillId` for manual overrides rather than real bills. */
const MANUAL_BILLED_SENTINELS = new Set(["manual", "unlinked"]);

/** True when the reading is linked to a bill that still exists (manual overrides don't count). */
export function isLinkedToExistingBill(reading: MeterReading, bills: Bill[]): boolean {
  const billId = reading.billedInBillId;
  if (!billId || MANUAL_BILLED_SENTINELS.has(billId)) return false;
  return bills.some((b) => b.id === billId);
}

/** Drops `billedInBillId` from every reading that points at one of the given bills. */
export function clearBilledInBillId(readings: MeterReading[], billIds: Set<string>): MeterReading[] {
  return readings.map((r) => {
    if (!r.billedInBillId || !billIds.has(r.billedInBillId)) return r;
    const next = { ...r };
    delete next.billedInBillId;
    return next;
  });
}
