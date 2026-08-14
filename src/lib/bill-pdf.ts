import fs from "fs";
import { saveBillPDFToFile } from "./db";
import { generateBillPDF } from "./pdf-generator";
import type { Bill, BrandingSettings, Customer, Meter, MeterReading, TariffRate } from "./types";

/** Stores PDF bytes on the bill: to disk when a storage path is configured, inline otherwise. */
export function attachBillPDF(bill: Bill, pdfBytes: Uint8Array, storagePath: string | undefined): void {
  if (storagePath) {
    bill.pdfFilePath = saveBillPDFToFile(bill.id, pdfBytes, storagePath);
    bill.pdfBase64 = undefined;
  } else {
    bill.pdfBase64 = Buffer.from(pdfBytes).toString("base64");
    bill.pdfFilePath = undefined;
  }
}

/** Renders the bill PDF and attaches it. Failures are logged, not thrown, so the
 *  bill itself is still saved. */
export async function renderAndAttachBillPDF(
  bill: Bill,
  customer: Customer,
  tariff: TariffRate,
  branding: BrandingSettings,
  openingReading: MeterReading,
  closingReading: MeterReading,
  meter: Meter | undefined,
  storagePath: string | undefined,
  errorContext = "",
): Promise<void> {
  try {
    const pdfBytes = await generateBillPDF(bill, customer, tariff, branding, openingReading, closingReading, meter);
    attachBillPDF(bill, pdfBytes, storagePath);
  } catch (err) {
    console.error(`PDF generation failed${errorContext ? ` for ${errorContext}` : ""}:`, err);
  }
}

/** Reads the bill's stored PDF, from disk or from the inline copy. */
export function loadBillPDF(bill: Bill): Buffer | null {
  if (bill.pdfFilePath && fs.existsSync(bill.pdfFilePath)) {
    return fs.readFileSync(bill.pdfFilePath);
  }
  if (bill.pdfBase64) {
    return Buffer.from(bill.pdfBase64, "base64");
  }
  return null;
}

/** Removes the bill's PDF file from disk, ignoring missing files and IO errors. */
export function deleteBillPDF(bill: Bill): void {
  if (!bill.pdfFilePath) return;
  try {
    if (fs.existsSync(bill.pdfFilePath)) fs.unlinkSync(bill.pdfFilePath);
  } catch { /* ignore */ }
}
