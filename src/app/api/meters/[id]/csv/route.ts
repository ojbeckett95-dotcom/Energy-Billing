import { NextRequest, NextResponse } from "next/server";
import { readData, writeData, generateId } from "@/lib/db";
import { notFound } from "@/lib/api-response";

// GET /api/meters/[id]/csv — export all readings for this meter as CSV
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();
  const meter = data.meters.find((m) => m.id === id);
  if (!meter) return notFound("Meter not found");

  const readings = data.meterReadings.filter((r) => r.meterId === id);

  const header = "id,readingDate,tariff1Kwh,tariff2Kwh,readMethod,billedInBillId,notes";
  const rows = readings.map((r) =>
    [
      r.id,
      r.readingDate,
      r.tariff1Kwh,
      r.tariff2Kwh,
      r.readMethod,
      r.billedInBillId ?? "",
      `"${(r.notes ?? "").replace(/"/g, '""')}"`,
    ].join(",")
  );

  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="meter-${id}.csv"`,
    },
  });
}

// POST /api/meters/[id]/csv — import CSV for this meter
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();
  const meter = data.meters.find((m) => m.id === id);
  if (!meter) return notFound("Meter not found");

  const text = await req.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return NextResponse.json({ imported: 0, updated: 0, skipped: 0 });

  // Skip header line
  const dataLines = lines.slice(1);

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const line of dataLines) {
    // Simple CSV parse (handles quoted notes field)
    const parts = parseCSVLine(line);
    if (parts.length < 5) { skipped++; continue; }

    const [csvId, readingDate, t1, t2, readMethod, , notes] = parts;

    const tariff1Kwh = parseFloat(t1);
    const tariff2Kwh = parseFloat(t2);
    if (isNaN(tariff1Kwh) || isNaN(tariff2Kwh)) { skipped++; continue; }

    const existingIdx = csvId ? data.meterReadings.findIndex((r) => r.id === csvId) : -1;

    if (existingIdx >= 0) {
      // Update existing — preserve billedInBillId
      data.meterReadings[existingIdx] = {
        ...data.meterReadings[existingIdx],
        readingDate,
        tariff1Kwh,
        tariff2Kwh,
        readMethod: (readMethod === "modbus" ? "modbus" : "manual") as "modbus" | "manual",
        notes: notes || undefined,
        meterId: id,
        customerId: meter.customerId,
      };
      updated++;
    } else {
      // Insert new
      data.meterReadings.push({
        id: csvId || generateId(),
        customerId: meter.customerId,
        meterId: id,
        readingDate,
        tariff1Kwh,
        tariff2Kwh,
        readMethod: (readMethod === "modbus" ? "modbus" : "manual") as "modbus" | "manual",
        notes: notes || undefined,
      });
      imported++;
    }
  }

  writeData(data);
  return NextResponse.json({ imported, updated, skipped });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
