import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import type { Customer } from "@/lib/types";
import { notFound } from "@/lib/api-response";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();
  const customer = data.customers.find((c) => c.id === id);
  if (!customer) return notFound();
  return NextResponse.json(customer);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as Partial<Customer>;
  const data = readData();
  const idx = data.customers.findIndex((c) => c.id === id);
  if (idx === -1) return notFound();
  data.customers[idx] = { ...data.customers[idx], ...body };
  writeData(data);
  return NextResponse.json(data.customers[idx]);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();
  data.customers = data.customers.filter((c) => c.id !== id);
  writeData(data);
  return NextResponse.json({ success: true });
}
