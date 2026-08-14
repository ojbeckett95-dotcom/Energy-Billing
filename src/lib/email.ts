import nodemailer from "nodemailer";
import type { Bill, Customer, BrandingSettings, EmailSettings, Meter } from "./types";
import { formatDate } from "./format-date";

function formatCurrency(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Converts a plain-text template body to an HTML email body.
 *  - Escapes all substituted variable values
 *  - Replaces {{logo}} with an <img> tag (already HTML, not escaped)
 *  - Converts newlines to <br> */
function buildHtmlBody(template: string, textVars: Record<string, string>, logoHtml: string): string {
  // Escape all text variable values for HTML
  const htmlVars: Record<string, string> = Object.fromEntries(
    Object.entries(textVars).map(([k, v]) => [k, escapeHtml(v)])
  );
  // Apply text vars (escaped), then insert logo HTML, then convert newlines
  const substituted = applyTemplate(template, { ...htmlVars, logo: "§§LOGO§§" })
    .replace(/\n/g, "<br>\n")
    .replace(/§§LOGO§§/g, logoHtml);
  return `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:600px;">${substituted}</body></html>`;
}

export async function sendBillEmail(
  bill: Bill,
  customer: Customer,
  branding: BrandingSettings,
  emailSettings: EmailSettings,
  pdfBytes: Uint8Array,
  meter?: Meter
): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: emailSettings.smtpHost,
      port: emailSettings.smtpPort,
      secure: emailSettings.smtpSecure,
      auth: {
        user: emailSettings.smtpUser,
        pass: emailSettings.smtpPassword,
      },
    });

    const dueDate = new Date(bill.generatedAt);
    dueDate.setDate(dueDate.getDate() + branding.paymentTermsDays);

    const billingPeriod = `${formatDate(bill.billingPeriodStart)} – ${formatDate(bill.billingPeriodEnd)}`;

    const vars: Record<string, string> = {
      customerName: customer.name,
      billingPeriod,
      total: formatCurrency(bill.total),
      dueDate: formatDate(dueDate.toISOString()),
      companyName: branding.companyName,
      companyEmail: branding.companyEmail,
      companyPhone: branding.companyPhone,
      accountNumber: customer.accountNumber,
      invoiceNumber: bill.id.toUpperCase(),
      meterSerial: meter?.serialNumber ?? "",
      meterName: meter?.name ?? "",
    };

    const subject = applyTemplate(emailSettings.subjectTemplate, { ...vars, logo: "" });

    // Plain-text version: logo stripped
    const textBody = applyTemplate(emailSettings.bodyTemplate, { ...vars, logo: "" });

    // HTML version: logo as <img> scaled to 40px high
    const logoHtml = branding.logoBase64
      ? `<img src="${branding.logoBase64}" alt="${escapeHtml(branding.companyName)}" height="40" style="height:40px;width:auto;display:block;margin-bottom:12px;" />`
      : "";
    const htmlBody = buildHtmlBody(emailSettings.bodyTemplate, vars, logoHtml);

    await transporter.sendMail({
      from: `"${emailSettings.fromName}" <${emailSettings.fromAddress}>`,
      to: customer.email,
      ...(emailSettings.bccAddress ? { bcc: emailSettings.bccAddress } : {}),
      subject,
      text: textBody,
      html: htmlBody,
      attachments: [
        {
          filename: `invoice-${bill.id}.pdf`,
          content: Buffer.from(pdfBytes),
          contentType: "application/pdf",
        },
      ],
    });

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown email error",
    };
  }
}

export async function sendBillEmailFailureNotification(
  customer: Customer,
  bill: Bill,
  failureReason: string,
  emailSettings: EmailSettings,
  branding: BrandingSettings,
): Promise<void> {
  if (!emailSettings.fromAddress || !emailSettings.smtpHost) return;
  try {
    const transporter = nodemailer.createTransport({
      host: emailSettings.smtpHost,
      port: emailSettings.smtpPort,
      secure: emailSettings.smtpSecure,
      auth: {
        user: emailSettings.smtpUser,
        pass: emailSettings.smtpPassword,
      },
    });

    const billingPeriod = `${formatDate(bill.billingPeriodStart)} – ${formatDate(bill.billingPeriodEnd)}`;

    await transporter.sendMail({
      from: `"${emailSettings.fromName}" <${emailSettings.fromAddress}>`,
      to: emailSettings.fromAddress,
      subject: `[Action Required] Failed to send bill to ${customer.name}`,
      text: [
        `Auto-billing notification from ${branding.companyName}`,
        ``,
        `A bill was generated but could NOT be emailed to the customer.`,
        ``,
        `Customer:        ${customer.name}`,
        `Customer email:  ${customer.email}`,
        `Account:         ${customer.accountNumber}`,
        `Billing period:  ${billingPeriod}`,
        `Total:           £${bill.total.toFixed(2)}`,
        `Bill ID:         ${bill.id.toUpperCase()}`,
        ``,
        `Failure reason:`,
        failureReason,
        ``,
        `The bill has been saved as a draft. Please log in and send it manually.`,
      ].join("\n"),
    });
  } catch (err) {
    // Notification failure is non-critical — just log it
    console.warn("[email] Could not send failure notification:", err instanceof Error ? err.message : err);
  }
}

export async function testSmtpConnection(
  emailSettings: EmailSettings
): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: emailSettings.smtpHost,
      port: emailSettings.smtpPort,
      secure: emailSettings.smtpSecure,
      auth: {
        user: emailSettings.smtpUser,
        pass: emailSettings.smtpPassword,
      },
    });
    await transporter.verify();
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
