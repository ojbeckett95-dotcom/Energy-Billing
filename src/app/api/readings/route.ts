import { withErrorHandling } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { readData, writeData, generateId } from "@/lib/db";
import type { MeterReading } from "@/lib/types";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");
  const meterId = searchParams.get("meterId");
  const showArchived = searchParams.get("archived") === "true";
  const data = readData();

  // Repair: mark any readings that should have billedInBillId but don't (e.g. due to
  // a race condition between the API server and the scheduler writing the JSON file).
  const readingDateMap = new Map(data.meterReadings.map(r => [r.id, r.readingDate]));
  let repaired = false;
  data.meterReadings = data.meterReadings.map(r => {
    if (r.billedInBillId || r.archived) return r;
    for (const bill of data.bills) {
      const sameScope = bill.meterId ? r.meterId === bill.meterId : r.customerId === bill.customerId;
      if (!sameScope) continue;
      const openDate = readingDateMap.get(bill.openingReadingId);
      const closeDate = readingDateMap.get(bill.closingReadingId);
      if (!openDate || !closeDate) continue;
      if (r.readingDate >= openDate && r.readingDate <= closeDate) {
        repaired = true;
        return { ...r, billedInBillId: bill.id };
      }
    }
    return r;
  });
  if (repaired) writeData(data);

  let readings = data.meterReadings;

  // By default hide archived readings; include them only when explicitly requested
  if (!showArchived) {
    readings = readings.filter((r) => !r.archived);
  } else {
    readings = readings.filter((r) => r.archived);
  }

  if (meterId) {
    readings = readings.filter((r) => r.meterId === meterId);
  } else if (customerId) {
    readings = readings.filter((r) => r.customerId === customerId);
  }
  return NextResponse.json(readings.sort((a, b) => b.readingDate.localeCompare(a.readingDate)));
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json() as Omit<MeterReading, "id">;
  const data = readData();

  // Auto-fill customerId from meter if not provided
  let customerId = body.customerId;
  if (!customerId && body.meterId) {
    const meter = data.meters.find((m) => m.id === body.meterId);
    if (meter) customerId = meter.customerId;
  }

  const reading: MeterReading = { ...body, customerId, id: generateId() };
  data.meterReadings.push(reading);
  writeData(data);
  return NextResponse.json(reading, { status: 201 });
});

// DELETE /api/readings — bulk delete by IDs
export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json() as { ids: string[] };
  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }
  const data = readData();
  const idSet = new Set(ids);
  const blocked: string[] = [];
  for (const r of data.meterReadings) {
    if (!idSet.has(r.id)) continue;
    const billExists = r.billedInBillId && r.billedInBillId !== "unlinked" && r.billedInBillId !== "manual" && data.bills.some(b => b.id === r.billedInBillId);
    if (billExists) blocked.push(r.id);
  }
  if (blocked.length > 0) {
    return NextResponse.json({ error: `${blocked.length} reading(s) are linked to existing bills and cannot be deleted.` }, { status: 409 });
  }
  data.meterReadings = data.meterReadings.filter(r => !idSet.has(r.id));
  writeData(data);
  return NextResponse.json({ success: true, deleted: ids.length });
});

// PATCH /api/readings — bulk update by IDs
// Supports: { ids, archived: boolean } or { ids, billedStatus: "billed" | "unbilled" }
export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json() as { ids: string[]; archived?: boolean; billedStatus?: "billed" | "unbilled" };
  const { ids, archived, billedStatus } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }
  const data = readData();
  const idSet = new Set(ids);
  data.meterReadings = data.meterReadings.map((r) => {
    if (!idSet.has(r.id)) return r;
    if (archived !== undefined) {
      if (archived) return { ...r, archived: true };
      const { archived: _, ...rest } = r;
      return rest;
    }
    if (billedStatus === "billed") {
      return { ...r, billedInBillId: "manual" };
    }
    if (billedStatus === "unbilled") {
      // Use sentinel "unlinked" rather than removing the field, so the repair
      // logic in GET (which re-applies billedInBillId by date range) won't
      // immediately undo this manual override on the next load.
      return { ...r, billedInBillId: "unlinked" };
    }
    return r;
  });
  writeData(data);
  return NextResponse.json({ success: true, count: ids.length });
});
