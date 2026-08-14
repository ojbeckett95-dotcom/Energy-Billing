import { NextRequest, NextResponse } from "next/server";
import { readData, writeData, updateData, generateId } from "@/lib/db";
import { parseBody, readingSchema, readingsPatchSchema, idListSchema } from "@/lib/validation";
import type { MeterReading } from "@/lib/types";

export async function GET(req: NextRequest) {
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
}

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, readingSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const data = readData();
  const meter = body.meterId ? data.meters.find((m) => m.id === body.meterId) : undefined;
  if (body.meterId && !meter) return NextResponse.json({ error: "Meter not found" }, { status: 404 });

  // Auto-fill customerId from meter if not provided
  const customerId = body.customerId ?? meter?.customerId;
  if (!customerId) return NextResponse.json({ error: "customerId or a known meterId is required" }, { status: 400 });
  if (!data.customers.some((c) => c.id === customerId)) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  if (meter && meter.customerId !== customerId) {
    return NextResponse.json({ error: "Meter does not belong to this customer" }, { status: 400 });
  }

  const reading: MeterReading = { ...body, customerId, id: generateId() };
  updateData((fresh) => { fresh.meterReadings.push(reading); });
  return NextResponse.json(reading, { status: 201 });
}

// DELETE /api/readings — bulk delete by IDs
export async function DELETE(req: NextRequest) {
  const parsed = await parseBody(req, idListSchema);
  if (!parsed.ok) return parsed.response;
  const { ids } = parsed.data;
  const idSet = new Set(ids);

  const blocked = updateData((data) => {
    const linked = data.meterReadings.filter((r) =>
      idSet.has(r.id)
      && r.billedInBillId
      && r.billedInBillId !== "unlinked"
      && r.billedInBillId !== "manual"
      && data.bills.some(b => b.id === r.billedInBillId)
    );
    if (linked.length > 0) return linked.length;
    data.meterReadings = data.meterReadings.filter(r => !idSet.has(r.id));
    return 0;
  });

  if (blocked > 0) {
    return NextResponse.json({ error: `${blocked} reading(s) are linked to existing bills and cannot be deleted.` }, { status: 409 });
  }
  return NextResponse.json({ success: true, deleted: ids.length });
}

// PATCH /api/readings — bulk update by IDs
// Supports: { ids, archived: boolean } or { ids, billedStatus: "billed" | "unbilled" }
export async function PATCH(req: NextRequest) {
  const parsed = await parseBody(req, readingsPatchSchema);
  if (!parsed.ok) return parsed.response;
  const { ids, archived, billedStatus } = parsed.data;
  const idSet = new Set(ids);
  updateData((data) => {
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
  });
  return NextResponse.json({ success: true, count: ids.length });
}
