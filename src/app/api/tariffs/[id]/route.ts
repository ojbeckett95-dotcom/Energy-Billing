import { NextRequest, NextResponse } from "next/server";
import { updateData } from "@/lib/db";
import { parseBody, tariffUpdateSchema } from "@/lib/validation";
import type { TariffRate } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseBody(req, tariffUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const updatedTariff = updateData((data): TariffRate | undefined => {
    const idx = data.tariffRates.findIndex((t) => t.id === id);
    if (idx === -1) return undefined;
    data.tariffRates[idx] = { ...data.tariffRates[idx], ...parsed.data };
    return data.tariffRates[idx];
  });

  if (!updatedTariff) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updatedTariff);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const inUse = updateData((data) => {
    const used = data.bills.some((b) => b.tariffRateId === id)
      || data.customers.some((c) => c.tariffPlanId === id)
      || data.customerTariffSchedules.some((s) => s.tariffRateId === id);
    if (used) return true;
    data.tariffRates = data.tariffRates.filter((t) => t.id !== id);
    return false;
  });

  if (inUse) {
    return NextResponse.json({ error: "Tariff is referenced by bills or customers and cannot be deleted." }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
