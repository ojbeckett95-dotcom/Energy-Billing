import { NextRequest, NextResponse } from "next/server";
import { readData, updateData, generateId } from "@/lib/db";

// GET /api/meters/[id]/csv — export all readings for this meter as CSV
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();
  const meter = data.meters.find((m) => m.id === id);
  if (!meter) return NextResponse.json({ error: "Meter not found" }, { status: 404 });

  const readings = data.meterReadings.filter((r) => r.meterId === id);

  const header = "id,readingDate,tariff1Kwh,tariff2Kwh,tariff3Kwh,tariff4Kwh,readMethod,billedInBillId,notes";
  const rows = readings.map((r) =>
    [
      r.id,
      r.readingDate,
      r.tariff1Kwh,
      r.tariff2Kwh,
      r.tariff3Kwh ?? "",
      r.tariff4Kwh ?? "",
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
  if (!readData().meters.some((m) => m.id === id)) {
    return NextResponse.json({ error: "Meter not found" }, { status: 404 });
  }

  const text = await req.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return NextResponse.json({ imported: 0, updated: 0, skipped: 0 });

  // Column order is taken from the header, so files exported before T3/T4 existed still import.
  const columns = parseCSVLine(lines[0]).map((c) => c.trim());
  const col = (name: string) => columns.indexOf(name);
  const dataLines = lines.slice(1);

  const result = updateData((data) => {
    const meter = data.meters.find((m) => m.id === id)!;
    const customerId = meter.customerId ?? "";
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const line of dataLines) {
      // Simple CSV parse (handles quoted notes field)
      const parts = parseCSVLine(line);
      const field = (name: string): string | undefined => {
        const idx = col(name);
        return idx >= 0 ? parts[idx] : undefined;
      };

      const csvId = field("id") ?? "";
      const readingDate = field("readingDate") ?? "";
      const tariff1Kwh = parseFloat(field("tariff1Kwh") ?? "");
      const tariff2Kwh = parseFloat(field("tariff2Kwh") ?? "");
      const tariff3Kwh = optionalNumber(field("tariff3Kwh"));
      const tariff4Kwh = optionalNumber(field("tariff4Kwh"));
      const readMethod = field("readMethod") === "modbus" ? "modbus" as const : "manual" as const;
      const notes = field("notes");

      if (Number.isNaN(Date.parse(readingDate))) { skipped++; continue; }
      if (!Number.isFinite(tariff1Kwh) || !Number.isFinite(tariff2Kwh)) { skipped++; continue; }
      if (tariff1Kwh < 0 || tariff2Kwh < 0) { skipped++; continue; }

      // Only ever touch readings that already belong to this meter, so a stale or
      // hand-edited id cannot rewrite another meter's reading.
      const existingIdx = csvId
        ? data.meterReadings.findIndex((r) => r.id === csvId && r.meterId === id)
        : -1;
      const idTakenElsewhere = csvId && existingIdx < 0 && data.meterReadings.some((r) => r.id === csvId);
      if (idTakenElsewhere) { skipped++; continue; }

      if (existingIdx >= 0) {
        // Readings already included in a bill are immutable.
        if (data.meterReadings[existingIdx].billedInBillId) { skipped++; continue; }
        data.meterReadings[existingIdx] = {
          ...data.meterReadings[existingIdx],
          readingDate,
          tariff1Kwh,
          tariff2Kwh,
          ...(tariff3Kwh !== undefined && { tariff3Kwh }),
          ...(tariff4Kwh !== undefined && { tariff4Kwh }),
          readMethod,
          notes: notes || undefined,
          meterId: id,
          customerId,
        };
        updated++;
      } else {
        data.meterReadings.push({
          id: csvId || generateId(),
          customerId,
          meterId: id,
          readingDate,
          tariff1Kwh,
          tariff2Kwh,
          ...(tariff3Kwh !== undefined && { tariff3Kwh }),
          ...(tariff4Kwh !== undefined && { tariff4Kwh }),
          readMethod,
          notes: notes || undefined,
        });
        imported++;
      }
    }

    return { imported, updated, skipped };
  });

  return NextResponse.json(result);
}

function optionalNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = parseFloat(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
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
