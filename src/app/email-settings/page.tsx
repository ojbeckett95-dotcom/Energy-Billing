"use client";

import { useEffect, useState } from "react";
import { Mail, Save, TestTube, CheckCircle, XCircle } from "lucide-react";
import AppShell from "@/components/AppShell";
import { toast } from "sonner";
import type { EmailSettings } from "@/lib/types";

const DEFAULT: EmailSettings = {
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPassword: "",
  fromAddress: "",
  fromName: "Energy Billing",
  subjectTemplate: "Your Energy Bill - {{billingPeriod}}",
  bodyTemplate: `Dear {{customerName}},

Please find attached your energy bill for {{billingPeriod}}.

Total Due: {{total}}
Due Date: {{dueDate}}

If you have any questions, please contact us.

Kind regards,
{{companyName}}`,
  autoSendEnabled: false,
  autoSendDay: 1,
  bccAddress: "",
};

const TEMPLATE_VARS = [
  { key: "{{customerName}}", desc: "Customer's full name" },
  { key: "{{billingPeriod}}", desc: "Billing period dates" },
  { key: "{{total}}", desc: "Total amount due" },
  { key: "{{dueDate}}", desc: "Payment due date" },
  { key: "{{companyName}}", desc: "Your company name" },
  { key: "{{invoiceNumber}}", desc: "Invoice/bill ID" },
  { key: "{{accountNumber}}", desc: "Customer account number" },
  { key: "{{meterSerial}}", desc: "Meter serial number" },
  { key: "{{meterName}}", desc: "Meter name/label" },
  { key: "{{logo}}", desc: "Company logo (HTML emails only, 40px high)" },
];

export default function EmailSettingsPage() {
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    fetch("/api/email-settings").then(r => r.json()).then(s => setSettings(prev => ({ ...prev, ...s })));
  }, []);

  function set<K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) {
    setSettings(s => ({ ...s, [key]: value }));
  }

  async function save() {
    setLoading(true);
    try {
      await fetch("/api/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      toast.success("Email settings saved");
    } finally {
      setLoading(false);
    }
  }

  async function testConnection() {
    // Save first
    await fetch("/api/email-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/email-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const result = await r.json();
      setTestResult(result);
      if (result.success) toast.success("SMTP connection successful!");
      else toast.error(`Connection failed: ${result.error}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <AppShell>
      <div className="p-8 max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Email Settings</h1>
            <p className="text-slate-500 text-sm mt-1">Configure SMTP and bill email templates</p>
          </div>
          <button onClick={save} disabled={loading} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors">
            <Save className="w-4 h-4" /> {loading ? "Saving..." : "Save Settings"}
          </button>
        </div>

        {/* SMTP Configuration */}
        <Section title="SMTP Configuration" icon={<Mail className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="SMTP Host" value={settings.smtpHost} onChange={(v) => set("smtpHost", v)} placeholder="smtp.gmail.com" required />
            <Field label="SMTP Port" type="number" value={String(settings.smtpPort)} onChange={(v) => set("smtpPort", parseInt(v) || 587)} placeholder="587" />
            <Field label="Username / Email" value={settings.smtpUser} onChange={(v) => set("smtpUser", v)} placeholder="you@yourcompany.com" />
            <Field label="Password" type="password" value={settings.smtpPassword} onChange={(v) => set("smtpPassword", v)} placeholder="••••••••" />
            <Field label="From Address" type="email" value={settings.fromAddress} onChange={(v) => set("fromAddress", v)} placeholder="billing@yourcompany.com" />
            <Field label="From Name" value={settings.fromName} onChange={(v) => set("fromName", v)} placeholder="Energy Billing" />
          </div>

          <div className="flex items-center gap-3 mt-4">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.smtpSecure}
                onChange={(e) => set("smtpSecure", e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Use SSL/TLS (port 465)
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button onClick={testConnection} disabled={testing || !settings.smtpHost} className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              {testing ? (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <TestTube className="w-4 h-4" />
              )}
              {testing ? "Testing..." : "Test Connection"}
            </button>
            {testResult && (
              <div className={`flex items-center gap-1.5 text-sm font-medium ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.success ? "Connected!" : testResult.error}
              </div>
            )}
          </div>

          <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            <strong>Gmail tip:</strong> Use an App Password (not your regular password) with smtp.gmail.com, port 587, TLS disabled.
          </div>
        </Section>

        {/* BCC */}
        <Section title="BCC Address" icon={<Mail className="w-4 h-4" />}>
          <p className="text-xs text-slate-500 mb-4">
            When set, every outgoing bill email will be silently copied to this address. Useful for keeping an internal record of all sent invoices.
          </p>
          <Field
            label="BCC Address"
            type="email"
            value={settings.bccAddress ?? ""}
            onChange={(v) => set("bccAddress", v)}
            placeholder="accounts@yourcompany.com (leave blank to disable)"
          />
        </Section>

        {/* Email Templates */}
        <Section title="Email Templates">
          <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-600 mb-2">Available template variables:</p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_VARS.map(v => (
                <span key={v.key} title={v.desc} className="inline-flex items-center px-2 py-0.5 bg-white border border-slate-200 rounded text-xs font-mono text-blue-700 cursor-default">{v.key}</span>
              ))}
            </div>
          </div>
          <Field label="Subject Line" value={settings.subjectTemplate} onChange={(v) => set("subjectTemplate", v)} placeholder="Your Energy Bill - {{billingPeriod}}" />
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Email Body</label>
            <textarea
              value={settings.bodyTemplate}
              onChange={(e) => set("bodyTemplate", e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </Section>

        <div className="flex justify-end pb-4">
          <button onClick={save} disabled={loading} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 px-6 rounded-lg transition-colors">
            <Save className="w-4 h-4" /> {loading ? "Saving..." : "Save All Settings"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-6 mb-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">{icon}{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={placeholder} />
    </div>
  );
}
