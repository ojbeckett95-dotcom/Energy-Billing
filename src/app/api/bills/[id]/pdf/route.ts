import { NextRequest, NextResponse } from "next/server";
import { readData } from "@/lib/db";
import fs from "fs";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = readData();
  const bill = data.bills.find((b) => b.id === id);
  if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let pdfBytes: Buffer;
  if (bill.pdfFilePath && fs.existsSync(bill.pdfFilePath)) {
    pdfBytes = fs.readFileSync(bill.pdfFilePath);
  } else if (bill.pdfBase64) {
    pdfBytes = Buffer.from(bill.pdfBase64, "base64");
  } else {
    return NextResponse.json({ error: "No PDF available" }, { status: 404 });
  }

  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64)}.pdf"`,
    },
  });
}
