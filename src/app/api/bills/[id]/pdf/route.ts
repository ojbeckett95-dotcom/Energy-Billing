import { NextRequest, NextResponse } from "next/server";
import { readData } from "@/lib/db";
import { notFound } from "@/lib/api-response";
import { loadBillPDF } from "@/lib/bill-pdf";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();
  const bill = data.bills.find((b) => b.id === id);
  if (!bill) return notFound();

  const pdfBytes = loadBillPDF(bill);
  if (!pdfBytes) return notFound("No PDF available");

  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${id}.pdf"`,
    },
  });
}
