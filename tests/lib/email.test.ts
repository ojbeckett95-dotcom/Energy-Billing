import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Bill, BrandingSettings, Customer, EmailSettings, Meter } from "@/lib/types";

const sendMail = vi.fn();
const verify = vi.fn();
const createTransport = vi.fn(() => ({ sendMail, verify }));

vi.mock("nodemailer", () => ({ default: { createTransport } }));

const { sendBillEmail, sendBillEmailFailureNotification, testSmtpConnection } = await import("@/lib/email");

const bill: Bill = {
  id: "acc1-12345-07032025",
  customerId: "c1",
  tariffRateId: "t1",
  billingPeriodStart: "2025-02-01",
  billingPeriodEnd: "2025-02-28",
  openingReadingId: "r1",
  closingReadingId: "r2",
  tariff1Usage: 100,
  tariff2Usage: 50,
  tariff1Cost: 30,
  tariff2Cost: 10,
  standingCharge: 5,
  subtotal: 45,
  vat: 2.25,
  total: 47.25,
  status: "draft",
  generatedAt: "2025-03-01T00:00:00.000Z",
};

const customer: Customer = {
  id: "c1",
  name: "Bob & Sons <Ltd>",
  email: "bob@example.com",
  address: "1 Road",
  accountNumber: "ACC-1",
  tariffPlanId: "t1",
  createdAt: "2025-01-01T00:00:00.000Z",
};

const branding: BrandingSettings = {
  companyName: "Energy & Co",
  companyAddress: "2 Street",
  companyPhone: "01234",
  companyEmail: "billing@energy.test",
  companyWebsite: "energy.test",
  primaryColor: "#000",
  secondaryColor: "#111",
  accentColor: "#222",
  footerText: "Thanks",
  paymentTermsDays: 14,
};

const emailSettings: EmailSettings = {
  smtpHost: "smtp.test",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "user",
  smtpPassword: "pass",
  fromAddress: "billing@energy.test",
  fromName: "Energy Billing",
  subjectTemplate: "Bill for {{customerName}} - {{billingPeriod}}",
  bodyTemplate: "{{logo}}Dear {{customerName}},\nTotal: {{total}}\nDue: {{dueDate}}\nMeter: {{meterSerial}}\n{{unknownVar}}",
  autoSendEnabled: false,
  autoSendDay: 1,
};

const meter: Meter = {
  id: "m1",
  serialNumber: "SN-1",
  name: "Main",
  meterIp: "10.0.0.1",
  meterPort: 502,
  meterUnitId: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendBillEmail", () => {
  it("sends a message with rendered subject, text body, HTML body and PDF attachment", async () => {
    const result = await sendBillEmail(bill, customer, branding, emailSettings, new Uint8Array([1, 2]), meter);
    expect(result).toEqual({ success: true });

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.test",
      port: 587,
      secure: false,
      auth: { user: "user", pass: "pass" },
    });

    const msg = sendMail.mock.calls[0][0];
    expect(msg.from).toBe('"Energy Billing" <billing@energy.test>');
    expect(msg.to).toBe("bob@example.com");
    expect(msg.subject).toBe("Bill for Bob & Sons <Ltd> - 01/02/2025 – 28/02/2025");
    expect(msg.text).toContain("Total: £47.25");
    expect(msg.text).toContain("Meter: SN-1");
    expect(msg.attachments).toEqual([
      { filename: "invoice-acc1-12345-07032025.pdf", content: Buffer.from([1, 2]), contentType: "application/pdf" },
    ]);
  });

  it("adds the payment terms to the generation date to get the due date", async () => {
    await sendBillEmail(bill, customer, branding, emailSettings, new Uint8Array(), meter);
    expect(sendMail.mock.calls[0][0].text).toContain("Due: 15/03/2025");
  });

  it("escapes substituted values in the HTML body but keeps them raw in the text body", async () => {
    await sendBillEmail(bill, customer, branding, emailSettings, new Uint8Array(), meter);
    const msg = sendMail.mock.calls[0][0];
    expect(msg.html).toContain("Dear Bob &amp; Sons &lt;Ltd&gt;,");
    expect(msg.html).not.toContain("<Ltd>");
    expect(msg.text).toContain("Dear Bob & Sons <Ltd>,");
    expect(msg.html).toContain("<br>");
  });

  it("renders the logo as an img tag in HTML and strips it from text and subject", async () => {
    await sendBillEmail(
      bill,
      customer,
      { ...branding, logoBase64: "data:image/png;base64,AAA" },
      emailSettings,
      new Uint8Array(),
      meter
    );
    const msg = sendMail.mock.calls[0][0];
    expect(msg.html).toContain('<img src="data:image/png;base64,AAA" alt="Energy &amp; Co" height="40"');
    expect(msg.text.startsWith("Dear")).toBe(true);
    expect(msg.subject).not.toContain("logo");
  });

  it("leaves unknown placeholders untouched", async () => {
    await sendBillEmail(bill, customer, branding, emailSettings, new Uint8Array(), meter);
    expect(sendMail.mock.calls[0][0].text).toContain("{{unknownVar}}");
  });

  it("omits meter fields when no meter is supplied", async () => {
    await sendBillEmail(bill, customer, branding, emailSettings, new Uint8Array());
    expect(sendMail.mock.calls[0][0].text).toContain("Meter: \n");
  });

  it("sets bcc only when configured", async () => {
    await sendBillEmail(bill, customer, branding, emailSettings, new Uint8Array(), meter);
    expect(sendMail.mock.calls[0][0].bcc).toBeUndefined();

    await sendBillEmail(bill, customer, branding, { ...emailSettings, bccAddress: "copy@energy.test" }, new Uint8Array(), meter);
    expect(sendMail.mock.calls[1][0].bcc).toBe("copy@energy.test");
  });

  it("keeps an unparseable date as-is instead of throwing", async () => {
    await sendBillEmail(
      { ...bill, billingPeriodStart: "not-a-date" },
      customer,
      branding,
      emailSettings,
      new Uint8Array(),
      meter
    );
    expect(sendMail.mock.calls[0][0].subject).toContain("not-a-date – 28/02/2025");
  });

  it("reports the transport error instead of throwing", async () => {
    sendMail.mockRejectedValueOnce(new Error("SMTP down"));
    await expect(sendBillEmail(bill, customer, branding, emailSettings, new Uint8Array(), meter)).resolves.toEqual({
      success: false,
      error: "SMTP down",
    });
  });

  it("reports a generic error for non-Error rejections", async () => {
    sendMail.mockRejectedValueOnce("boom");
    await expect(sendBillEmail(bill, customer, branding, emailSettings, new Uint8Array(), meter)).resolves.toEqual({
      success: false,
      error: "Unknown email error",
    });
  });
});

describe("sendBillEmailFailureNotification", () => {
  it("emails the sender address with the failure details", async () => {
    await sendBillEmailFailureNotification(customer, bill, "mailbox full", emailSettings, branding);
    const msg = sendMail.mock.calls[0][0];
    expect(msg.to).toBe("billing@energy.test");
    expect(msg.subject).toBe("[Action Required] Failed to send bill to Bob & Sons <Ltd>");
    expect(msg.text).toContain("mailbox full");
    expect(msg.text).toContain("Total:           £47.25");
    expect(msg.text).toContain("01/02/2025 – 28/02/2025");
  });

  it("does nothing when SMTP is not configured", async () => {
    await sendBillEmailFailureNotification(customer, bill, "x", { ...emailSettings, smtpHost: "" }, branding);
    await sendBillEmailFailureNotification(customer, bill, "x", { ...emailSettings, fromAddress: "" }, branding);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("swallows send failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sendMail.mockRejectedValueOnce(new Error("nope"));
    await expect(
      sendBillEmailFailureNotification(customer, bill, "x", emailSettings, branding)
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("testSmtpConnection", () => {
  it("verifies the transport", async () => {
    await expect(testSmtpConnection(emailSettings)).resolves.toEqual({ success: true });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("returns the verification error", async () => {
    verify.mockRejectedValueOnce(new Error("auth failed"));
    await expect(testSmtpConnection(emailSettings)).resolves.toEqual({ success: false, error: "auth failed" });
  });

  it("returns a fallback message for non-Error failures", async () => {
    verify.mockRejectedValueOnce("nope");
    await expect(testSmtpConnection(emailSettings)).resolves.toEqual({ success: false, error: "Connection failed" });
  });
});
