import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "pdf-lib";
import type { Bill, Customer, TariffRate, BrandingSettings, MeterReading, Meter } from "./types";
import { formatDate } from "./format-date";

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

function formatCurrency(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: [number, number, number] = [0, 0, 0]
) {
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: rgb(...color),
  });
}

function drawLine(
  page: PDFPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: [number, number, number] = [0.8, 0.8, 0.8],
  thickness = 0.5
) {
  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness,
    color: rgb(...color),
  });
}

function drawRect(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number]
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(...color),
  });
}

export async function generateBillPDF(
  bill: Bill,
  customer: Customer,
  tariff: TariffRate,
  branding: BrandingSettings,
  openingReading: MeterReading,
  closingReading: MeterReading,
  meter?: Meter
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const primaryColor = hexToRgb(branding.primaryColor ?? "#1e40af");
  const secondaryColor = hexToRgb(branding.secondaryColor ?? "#1e3a5f");
  const accentColor = hexToRgb(branding.accentColor ?? "#3b82f6");

  const W = 595.28;
  const margin = 45;
  let y = 800;

  // ── Header bar ──────────────────────────────────────────────────────────────
  drawRect(page, 0, 800, W, 41.89, primaryColor);
  
  drawText(page, "ENERGY INVOICE", W - margin - 110, 813, boldFont, 13, [1, 1, 1]);

  y = 768;

  // Logo below the header bar (if present)
  if (branding.logoBase64) {
    try {
      const [header, logoData] = branding.logoBase64.includes(",")
        ? branding.logoBase64.split(",") as [string, string]
        : ["", branding.logoBase64];
      const isJpeg = header.includes("image/jpeg") || header.includes("image/jpg");
      const logoBytes = Buffer.from(logoData, "base64");
      const logoImage = isJpeg
        ? await pdfDoc.embedJpg(logoBytes)
        : await pdfDoc.embedPng(logoBytes);
      // Always render at a fixed 44pt height, derive width from aspect ratio, cap at 200pt wide
      const { width: iw, height: ih } = logoImage;
      const fixedH = 40;
      const derivedW = (iw / ih) * fixedH;
      const logoW = Math.min(derivedW, 200);
      const logoH = logoW < derivedW ? (ih / iw) * logoW : fixedH;
      page.drawImage(logoImage, {
        x: margin,
        y: y - logoH,
        width: logoW,
        height: logoH,
      });
      y -= (logoH + 22);
    } catch {
      // Logo failed – continue without it
    }
  }

  // ── Company + Customer Info ──────────────────────────────────────────────────
  const colLeft = margin;
  const colRight = W / 2 + 10;

  drawText(page, branding.companyName, colLeft, y, boldFont, 10, secondaryColor);
  drawText(page, "BILLED TO", colRight, y, boldFont, 8, accentColor);
  y -= 14;

  const companyLines = [
    branding.companyAddress,
    branding.companyPhone,
    branding.companyEmail,
    branding.companyWebsite,
    branding.vatNumber ? `VAT: ${branding.vatNumber}` : "",
    branding.companyRegistration ? `Reg: ${branding.companyRegistration}` : "",
  ].filter(Boolean);

  const customerLines = [
    customer.name,
    customer.address,
    customer.email,
    `Account: ${customer.accountNumber}`,
  ];

  const maxLines = Math.max(companyLines.length, customerLines.length);
  for (let i = 0; i < maxLines; i++) {
    if (companyLines[i]) drawText(page, companyLines[i], colLeft, y, regularFont, 8.5);
    if (customerLines[i]) drawText(page, customerLines[i], colRight, y, regularFont, 8.5);
    y -= 13;
  }

  y -= 10;
  drawLine(page, margin, y, W - margin, y, accentColor, 1.5);
  y -= 18;

  // ── Invoice Details Band ─────────────────────────────────────────────────────
  const dueDate = new Date(bill.generatedAt);
  dueDate.setDate(dueDate.getDate() + branding.paymentTermsDays);

  const detailCols = [
    ["Invoice Number", bill.id.toUpperCase()],
    ["Issue Date", formatDate(bill.generatedAt)],
    ["Due Date", formatDate(dueDate.toISOString())],
    ["Billing Period", `${formatDate(bill.billingPeriodStart)} – ${formatDate(bill.billingPeriodEnd)}`],
  ];

  drawRect(page, margin, y - 4, W - margin * 2, 36, [0.96, 0.97, 1.0]);
  y -= 1;
  const detailColW = (W - margin * 2) / detailCols.length;
  for (let i = 0; i < detailCols.length; i++) {
    const cx = margin + i * detailColW + 8;
    drawText(page, detailCols[i][0], cx, y + 18, regularFont, 7.5, [0.45, 0.45, 0.5]);
    drawText(page, detailCols[i][1], cx, y + 5, boldFont, 8.5, secondaryColor);
  }
  y -= 46;

  // ── Meter Readings Table ─────────────────────────────────────────────────────
  drawText(page, "METER READINGS", margin, y, boldFont, 9, accentColor);
  if (meter) {
    if (meter.name) {
      drawText(page, `Meter: ${meter.name}`, W - margin - 200, y + 9, regularFont, 8, [0.45, 0.45, 0.5]);
    }
    if (meter.serialNumber) {
      drawText(page, `S/N: ${meter.serialNumber}`, W - margin - 200, y - 1, regularFont, 8, [0.45, 0.45, 0.5]);
    }
  }
  y -= 16;

  // Build dynamic list of enabled tariffs (1–4)
  const enabledTariffs = [
    { label: tariff.tariff1Label, openKwh: openingReading.tariff1Kwh, closeKwh: closingReading.tariff1Kwh, usage: bill.tariff1Usage, rate: tariff.tariff1RatePerKwh, cost: bill.tariff1Cost },
    ...(tariff.tariff2Enabled !== false ? [{ label: tariff.tariff2Label, openKwh: openingReading.tariff2Kwh, closeKwh: closingReading.tariff2Kwh, usage: bill.tariff2Usage, rate: tariff.tariff2RatePerKwh, cost: bill.tariff2Cost }] : []),
    ...(tariff.tariff3Enabled ? [{ label: tariff.tariff3Label ?? "T3", openKwh: openingReading.tariff3Kwh ?? 0, closeKwh: closingReading.tariff3Kwh ?? 0, usage: bill.tariff3Usage ?? 0, rate: tariff.tariff3RatePerKwh ?? 0, cost: bill.tariff3Cost ?? 0 }] : []),
    ...(tariff.tariff4Enabled ? [{ label: tariff.tariff4Label ?? "T4", openKwh: openingReading.tariff4Kwh ?? 0, closeKwh: closingReading.tariff4Kwh ?? 0, usage: bill.tariff4Usage ?? 0, rate: tariff.tariff4RatePerKwh ?? 0, cost: bill.tariff4Cost ?? 0 }] : []),
  ];
  const contentW = W - margin * 2;
  const labelColW = 75;
  const dateColW = 88;
  const tariffColW = Math.floor((contentW - labelColW - dateColW) / enabledTariffs.length);
  const readingColW = [labelColW, dateColW, ...enabledTariffs.map(() => tariffColW)];
  const readingHeaders = ["", "Date", ...enabledTariffs.map(t => `${t.label} (kWh)`)];
  const readingRows = [
    ["Opening Reading", formatDate(openingReading.readingDate), ...enabledTariffs.map(t => t.openKwh.toFixed(2))],
    ["Closing Reading", formatDate(closingReading.readingDate), ...enabledTariffs.map(t => t.closeKwh.toFixed(2))],
    ["Usage", "", ...enabledTariffs.map(t => t.usage.toFixed(2))],
  ];

  // Header row
  drawRect(page, margin, y - 4, W - margin * 2, 18, primaryColor);
  let cx = margin + 6;
  for (let i = 0; i < readingHeaders.length; i++) {
    drawText(page, readingHeaders[i], cx, y + 2, boldFont, 8, [1, 1, 1]);
    cx += readingColW[i];
  }
  y -= 22;

  for (let r = 0; r < readingRows.length; r++) {
    const rowColor: [number, number, number] = r % 2 === 0 ? [1, 1, 1] : [0.97, 0.98, 1.0];
    drawRect(page, margin, y - 4, W - margin * 2, 18, rowColor);
    cx = margin + 6;
    for (let c = 0; c < readingRows[r].length; c++) {
      const isBold = r === 2;
      drawText(page, readingRows[r][c], cx, y + 2, isBold ? boldFont : regularFont, 8.5, r === 2 ? secondaryColor : [0.1, 0.1, 0.1]);
      cx += readingColW[c];
    }
    y -= 18;
  }

  y -= 16;

  // ── Charges Table ────────────────────────────────────────────────────────────
  drawText(page, "CHARGES", margin, y, boldFont, 9, accentColor);
  y -= 16;

  const chargeHeaders = ["Description", "Units", "Rate", "Amount"];
  const chargeColW = [220, 80, 110, 100];

  drawRect(page, margin, y - 4, W - margin * 2, 18, primaryColor);
  cx = margin + 6;
  for (let i = 0; i < chargeHeaders.length; i++) {
    drawText(page, chargeHeaders[i], cx, y + 2, boldFont, 8, [1, 1, 1]);
    cx += chargeColW[i];
  }
  y -= 22;

  const billingDays = Math.ceil(
    (new Date(bill.billingPeriodEnd).getTime() - new Date(bill.billingPeriodStart).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const chargeRows = [
    ...enabledTariffs.map(t => [`${t.label} Energy`, `${t.usage.toFixed(2)} kWh`, `£${t.rate.toFixed(6)}/kWh`, formatCurrency(t.cost)]),
    [`Standing Charge`, `${billingDays} days`, `${(tariff.standingChargePerDay * 100).toFixed(3)}p/day`, formatCurrency(bill.standingCharge)],
  ];

  for (let r = 0; r < chargeRows.length; r++) {
    const rowColor: [number, number, number] = r % 2 === 0 ? [1, 1, 1] : [0.97, 0.98, 1.0];
    drawRect(page, margin, y - 4, W - margin * 2, 18, rowColor);
    cx = margin + 6;
    for (let c = 0; c < chargeRows[r].length; c++) {
      drawText(page, chargeRows[r][c], cx, y + 2, regularFont, 8.5);
      cx += chargeColW[c];
    }
    y -= 18;
  }

  y -= 12;

  // ── Totals ───────────────────────────────────────────────────────────────────
  const totalsX = W / 2 + 20;
  const totalsLabelW = 120;
  const totalsValueX = totalsX + totalsLabelW + 10;

  const totalsRows = [
    ["Subtotal", formatCurrency(bill.subtotal)],
    [`VAT (${tariff.vatRate}%)`, formatCurrency(bill.vat)],
  ];

  for (const [label, value] of totalsRows) {
    drawText(page, label, totalsX, y, regularFont, 9, [0.3, 0.3, 0.35]);
    drawText(page, value, totalsValueX, y, regularFont, 9, [0.1, 0.1, 0.1]);
    y -= 16;
  }

  drawLine(page, totalsX, y + 8, W - margin, y + 8, primaryColor, 1.5);
  y -= 4;
  drawText(page, "TOTAL DUE", totalsX, y, boldFont, 12, secondaryColor);
  drawText(page, formatCurrency(bill.total), totalsValueX, y, boldFont, 12, primaryColor);
  y -= 72;

  // ── Payment Details ──────────────────────────────────────────────────────────
  if (branding.bankAccountNumber || branding.bankIban) {
    drawRect(page, margin, y - 8, W - margin * 2, 70, [0.96, 0.97, 1.0]);
    drawText(page, "PAYMENT DETAILS", margin + 10, y + 48, boldFont, 9, secondaryColor);
    y += 32;
    const bankFields = [
      branding.bankName ? `Bank: ${branding.bankName}` : null,
      branding.bankAccountName ? `Account Name: ${branding.bankAccountName}` : null,
      branding.bankSortCode ? `Sort Code: ${branding.bankSortCode}` : null,
      branding.bankAccountNumber ? `Account Number: ${branding.bankAccountNumber}` : null,
      branding.bankIban ? `IBAN: ${branding.bankIban}` : null,
    ].filter(Boolean) as string[];

    const half = Math.ceil(bankFields.length / 2);
    for (let i = 0; i < half; i++) {
      drawText(page, bankFields[i], margin + 10, y, regularFont, 8.5);
      if (bankFields[i + half]) {
        drawText(page, bankFields[i + half], W / 2 + 10, y, regularFont, 8.5);
      }
      y -= 13;
    }
    y -= 20;
  }

  // ── Tariff Info ───────────────────────────────────────────────────────────────
  y -= 10;
  drawText(page, `Tariff: ${tariff.name}`, margin, y, regularFont, 8, [0.5, 0.5, 0.55]);
  y -= 12;
  drawText(
    page,
    `Rates effective from ${formatDate(tariff.effectiveFrom)}${tariff.effectiveTo ? ` to ${formatDate(tariff.effectiveTo)}` : ""}`,
    margin,
    y,
    regularFont,
    8,
    [0.5, 0.5, 0.55]
  );

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerY = 32;
  drawRect(page, 0, 0, W, footerY + 6, [0.15, 0.2, 0.35]);
  drawText(page, branding.footerText, margin, footerY - 4, regularFont, 7.5, [0.8, 0.85, 0.95]);
  drawText(
    page,
    `${branding.companyName} | ${branding.companyEmail} | ${branding.companyPhone}`,
    margin,
    18,
    regularFont,
    7,
    [0.6, 0.65, 0.8]
  );

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
