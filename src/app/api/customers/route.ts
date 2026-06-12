import { NextRequest, NextResponse } from "next/server";
import { readData, writeData, generateId } from "@/lib/db";
import type { Customer } from "@/lib/types";

export async function GET() {
  const data = readData();
  return NextResponse.json(data.customers);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Omit<Customer, "id" | "createdAt">;
  const data = readData();
  const customer: Customer = {
    ...body,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  data.customers.push(customer);
  writeData(data);
  return NextResponse.json(customer, { status: 201 });
}
