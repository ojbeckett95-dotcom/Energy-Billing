"use client";

import { useEffect, useState, useRef } from "react";
import { Palette, Upload, Save, RotateCcw } from "lucide-react";
import AppShell from "@/components/AppShell";
import { toast } from "sonner";
import type { BrandingSettings } from "@/lib/types";
import { apiGet, apiSend, errorText } from "@/lib/api-client";

const DEFAULT_BRANDING: BrandingSettings = {
  companyName: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  companyWebsite: "",
  companyRegistration: "",
  vatNumber: "",
  logoBase64: "",
  primaryColor: "#1e40af",
  secondaryColor: "#1e3a5f",
  accentColor: "#3b82f6",
  footerText: "Thank you for your business. Payment is due within the terms stated above.",
  paymentTermsDays: 14,
  bankName: "",
  bankAccountName: "",
  bankSortCode: "",
  bankAccountNumber: "",
  bankIban: "",
};

export default function BrandingPage() {
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<BrandingSettings>("/api/branding")
      .then(setBranding)
      .catch(err => toast.error(`Could not load branding settings: ${errorText(err)}`));
  }, []);

  function set(key: keyof BrandingSettings, value: string | number) {
    setBranding(b => ({ ...b, [key]: value }));
  }

  async function save() {
    setLoading(true);
    try {
      await apiSend("/api/branding", "PUT", branding);
      toast.success("Branding settings saved");
    } catch (err) {
      toast.error(`Could not save branding settings: ${errorText(err)}`);
    } finally {
      setLoading(false);
    }
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX_W = 600, MAX_H = 120;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX_W) { h = Math.round((h / w) * MAX_W); w = MAX_W; }
        if (h > MAX_H) { w = Math.round((w / h) * MAX_H); h = MAX_H; }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        const png = canvas.toDataURL("image/png");
        setBranding(b => ({ ...b, logoBase64: png }));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  return (
    <AppShell>
      <div className="p-8 max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Branding Settings</h1>
            <p className="text-slate-500 text-sm mt-1">Customise your bill appearance and company information</p>
          </div>
          <button onClick={save} disabled={loading} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors">
            <Save className="w-4 h-4" /> {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {/* Logo */}
        <Section title="Logo" icon={<Palette className="w-4 h-4" />}>
          <div className="flex items-center gap-6">
            <div className="w-32 h-20 bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden border border-slate-200">
              {branding.logoBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logoBase64} alt="Logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <div className="text-slate-400 text-xs text-center px-2">No logo</div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm rounded-lg hover:bg-slate-50 transition-colors">
                <Upload className="w-4 h-4" /> Upload Logo
              </button>
              {branding.logoBase64 && (
                <button onClick={() => set("logoBase64", "")} className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" /> Remove
                </button>
              )}
              <p className="text-xs text-slate-400">PNG or JPG, recommended 300×80px</p>
            </div>
          </div>
        </Section>

        {/* Colours */}
        <Section title="Brand Colours">
          <div className="grid grid-cols-3 gap-4">
            <ColorField label="Primary Colour" value={branding.primaryColor} onChange={(v) => set("primaryColor", v)} />
            <ColorField label="Secondary Colour" value={branding.secondaryColor} onChange={(v) => set("secondaryColor", v)} />
            <ColorField label="Accent Colour" value={branding.accentColor} onChange={(v) => set("accentColor", v)} />
          </div>
          <div className="mt-4 h-10 rounded-xl overflow-hidden flex">
            <div className="flex-1" style={{ background: branding.primaryColor }} />
            <div className="flex-1" style={{ background: branding.secondaryColor }} />
            <div className="flex-1" style={{ background: branding.accentColor }} />
          </div>
        </Section>

        {/* Company Info */}
        <Section title="Company Information">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company Name" value={branding.companyName} onChange={(v) => set("companyName", v)} required />
            <Field label="Phone" value={branding.companyPhone} onChange={(v) => set("companyPhone", v)} />
            <Field label="Email" value={branding.companyEmail} onChange={(v) => set("companyEmail", v)} type="email" />
            <Field label="Website" value={branding.companyWebsite} onChange={(v) => set("companyWebsite", v)} />
            <Field label="Company Reg. Number" value={branding.companyRegistration ?? ""} onChange={(v) => set("companyRegistration", v)} />
            <Field label="VAT Number" value={branding.vatNumber ?? ""} onChange={(v) => set("vatNumber", v)} />
          </div>
          <Field label="Address" value={branding.companyAddress} onChange={(v) => set("companyAddress", v)} textarea />
        </Section>

        {/* Payment */}
        <Section title="Payment Settings">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Payment Terms (days)</label>
              <input type="number" value={branding.paymentTermsDays} onChange={(e) => set("paymentTermsDays", parseInt(e.target.value) || 14)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <Field label="Bank Name" value={branding.bankName ?? ""} onChange={(v) => set("bankName", v)} />
            <Field label="Account Name" value={branding.bankAccountName ?? ""} onChange={(v) => set("bankAccountName", v)} />
            <Field label="Sort Code" value={branding.bankSortCode ?? ""} onChange={(v) => set("bankSortCode", v)} placeholder="XX-XX-XX" />
            <Field label="Account Number" value={branding.bankAccountNumber ?? ""} onChange={(v) => set("bankAccountNumber", v)} />
            <Field label="IBAN" value={branding.bankIban ?? ""} onChange={(v) => set("bankIban", v)} placeholder="GB00 XXXX XXXX XXXX XXXX XX" />
          </div>
        </Section>

        {/* Footer */}
        <Section title="Bill Footer Text">
          <Field label="Footer Text" value={branding.footerText} onChange={(v) => set("footerText", v)} textarea />
        </Section>

        {/* Preview strip */}
        <Section title="Bill Header Preview">
          <div className="rounded-xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4" style={{ background: branding.primaryColor }}>
              <span className="text-white font-bold text-sm">{branding.companyName || "Your Company"}</span>
              <span className="text-white font-semibold text-sm opacity-80">ENERGY INVOICE</span>
            </div>
            {branding.logoBase64 && (
              <div className="px-6 pt-3 pb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logoBase64} alt="Logo" className="h-10 object-contain" />
              </div>
            )}
            <div className="p-4 text-xs" style={{ color: branding.secondaryColor }}>
              <p className="font-semibold">{branding.companyName || "Your Company Name"}</p>
              <p className="text-slate-500">{branding.companyAddress || "Company Address"}</p>
            </div>
            <div className="px-4 pb-3 text-xs text-slate-400 italic border-t border-slate-100 pt-2" style={{ background: "#f8fafc" }}>
              {branding.footerText}
            </div>
          </div>
        </Section>

        <div className="flex justify-end pb-4">
          <button onClick={save} disabled={loading} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 px-6 rounded-lg transition-colors">
            <Save className="w-4 h-4" /> {loading ? "Saving..." : "Save All Changes"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-6 mb-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required, textarea }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean; textarea?: boolean;
}) {
  const cls = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={cls + " resize-none"} placeholder={placeholder} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={cls} placeholder={placeholder} />
      )}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-white">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent p-0" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 text-sm font-mono border-0 focus:outline-none bg-transparent" maxLength={7} />
      </div>
    </div>
  );
}
