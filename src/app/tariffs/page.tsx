"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Zap, CalendarDays } from "lucide-react";
import AppShell from "@/components/AppShell";
import { toast } from "sonner";
import { format } from "date-fns";
import type { TariffRate } from "@/lib/types";
import { apiGet, apiSend, errorText } from "@/lib/api-client";

const today = new Date().toISOString().slice(0, 10);

const EMPTY = {
  name: "",
  effectiveFrom: today,
  effectiveTo: "",
  tariff1RatePerKwh: "",
  tariff2Enabled: true,
  tariff2RatePerKwh: "",
  tariff3Enabled: false,
  tariff3RatePerKwh: "",
  tariff4Enabled: false,
  tariff4RatePerKwh: "",
  tariff1Label: "Unit",
  tariff2Label: "Off-Peak",
  tariff3Label: "Tariff 3",
  tariff4Label: "Tariff 4",
  standingChargePerDay: "",
  vatRate: "5",
  notes: "",
};

export default function TariffsPage() {
  const [tariffs, setTariffs] = useState<TariffRate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setTariffs(await apiGet<TariffRate[]>("/api/tariffs"));
    } catch (err) {
      toast.error(`Could not load tariffs: ${errorText(err)}`);
    }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditId(null);
    setForm({ ...EMPTY });
    setShowForm(true);
  }

  function openEdit(t: TariffRate) {
    setEditId(t.id);
    setForm({
      name: t.name,
      effectiveFrom: t.effectiveFrom,
      effectiveTo: t.effectiveTo ?? "",
      tariff1RatePerKwh: String(t.tariff1RatePerKwh),
      tariff2Enabled: t.tariff2Enabled !== false,
      tariff2RatePerKwh: String(t.tariff2RatePerKwh),
      tariff3Enabled: t.tariff3Enabled ?? false,
      tariff3RatePerKwh: String(t.tariff3RatePerKwh ?? ""),
      tariff4Enabled: t.tariff4Enabled ?? false,
      tariff4RatePerKwh: String(t.tariff4RatePerKwh ?? ""),
      tariff1Label: t.tariff1Label,
      tariff2Label: t.tariff2Label,
      tariff3Label: t.tariff3Label ?? "Tariff 3",
      tariff4Label: t.tariff4Label ?? "Tariff 4",
      standingChargePerDay: String(t.standingChargePerDay),
      vatRate: String(t.vatRate),
      notes: t.notes ?? "",
    });
    setShowForm(true);
  }

  async function save() {
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || undefined,
        tariff1RatePerKwh: parseFloat(form.tariff1RatePerKwh),
        tariff2Enabled: form.tariff2Enabled,
        tariff2RatePerKwh: form.tariff2Enabled ? parseFloat(form.tariff2RatePerKwh) : 0,
        tariff3Enabled: form.tariff3Enabled,
        tariff3RatePerKwh: form.tariff3Enabled ? parseFloat(form.tariff3RatePerKwh) : 0,
        tariff4Enabled: form.tariff4Enabled,
        tariff4RatePerKwh: form.tariff4Enabled ? parseFloat(form.tariff4RatePerKwh) : 0,
        tariff1Label: form.tariff1Label,
        tariff2Label: form.tariff2Label,
        tariff3Label: form.tariff3Label || "Tariff 3",
        tariff4Label: form.tariff4Label || "Tariff 4",
        standingChargePerDay: parseFloat(form.standingChargePerDay),
        vatRate: parseFloat(form.vatRate),
        notes: form.notes,
      };
      if (editId) {
        await apiSend(`/api/tariffs/${editId}`, "PUT", payload);
        toast.success("Tariff updated");
      } else {
        await apiSend("/api/tariffs", "POST", payload);
        toast.success("Tariff created");
      }
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(`Could not save tariff: ${errorText(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this tariff rate?")) return;
    try {
      await apiSend(`/api/tariffs/${id}`, "DELETE");
      toast.success("Tariff deleted");
    } catch (err) {
      toast.error(`Could not delete tariff: ${errorText(err)}`);
    }
    load();
  }

  return (
    <AppShell>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tariff Rates</h1>
            <p className="text-slate-500 text-sm mt-1">Manage tariff rates by period (up to 4 tariffs per rate)</p>
          </div>
          <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> New Tariff
          </button>
        </div>

        {tariffs.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
            <Zap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No tariff rates yet. Create one to start billing.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {tariffs.map((t) => {
              const isActive = !t.effectiveTo || new Date(t.effectiveTo) >= new Date();
              return (
                <div key={t.id} className="bg-white rounded-xl border border-slate-100 p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full mt-0.5 ${isActive ? "bg-green-400" : "bg-slate-300"}`} />
                      <div>
                        <h3 className="font-semibold text-slate-900">{t.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                          <CalendarDays className="w-3.5 h-3.5" />
                          From {format(new Date(t.effectiveFrom), "dd/MM/yyyy")}
                          {t.effectiveTo ? ` to ${format(new Date(t.effectiveTo), "dd/MM/yyyy")}` : " (current)"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                        {isActive ? "Active" : "Expired"}
                      </span>
                      <button onClick={() => openEdit(t)} className="p-1.5 ml-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
                    <RateCard label={`${t.tariff1Label} Rate`} value={`£${t.tariff1RatePerKwh.toFixed(6)}`} sub="per kWh" color="blue" />
                    {t.tariff2Enabled !== false
                      ? <RateCard label={`${t.tariff2Label} Rate`} value={`£${t.tariff2RatePerKwh.toFixed(6)}`} sub="per kWh" color="purple" />
                      : <RateCard label="Tariff 2" value="Disabled" sub="single-tariff" color="slate" />
                    }
                    {t.tariff3Enabled && <RateCard label={`${t.tariff3Label ?? "T3"} Rate`} value={`£${(t.tariff3RatePerKwh ?? 0).toFixed(6)}`} sub="per kWh" color="green" />}
                    {t.tariff4Enabled && <RateCard label={`${t.tariff4Label ?? "T4"} Rate`} value={`£${(t.tariff4RatePerKwh ?? 0).toFixed(6)}`} sub="per kWh" color="orange" />}
                    <RateCard label="Standing Charge" value={`${(t.standingChargePerDay * 100).toFixed(3)}p`} sub="per day" color="amber" />
                    <RateCard label="VAT Rate" value={`${t.vatRate}%`} sub="applicable" color="slate" />
                  </div>

                  {t.notes && <p className="mt-3 text-xs text-slate-500 italic">{t.notes}</p>}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-900">{editId ? "Edit Tariff" : "New Tariff Rate"}</h2>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <Field label="Tariff Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Winter 2025/26" required />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Effective From <span className="text-red-500">*</span></label>
                    <input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Effective To <span className="text-slate-400">(optional)</span></label>
                    <input type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">Tariff 1</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Label" value={form.tariff1Label} onChange={(v) => setForm({ ...form, tariff1Label: v })} placeholder="Peak" />
                    <Field label="Rate (£/kWh)" type="number" value={form.tariff1RatePerKwh} onChange={(v) => setForm({ ...form, tariff1RatePerKwh: v })} placeholder="0.28" required />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Tariff 2</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-slate-500">{form.tariff2Enabled ? "Enabled" : "Disabled"}</span>
                      <div
                        onClick={() => setForm(f => ({ ...f, tariff2Enabled: !f.tariff2Enabled }))}
                        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${form.tariff2Enabled ? "bg-blue-600" : "bg-slate-300"}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${form.tariff2Enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                      </div>
                    </label>
                  </div>
                  {form.tariff2Enabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Label" value={form.tariff2Label} onChange={(v) => setForm({ ...form, tariff2Label: v })} placeholder="Off-Peak" />
                      <Field label="Rate (£/kWh)" type="number" value={form.tariff2RatePerKwh} onChange={(v) => setForm({ ...form, tariff2RatePerKwh: v })} placeholder="0.14" required />
                    </div>
                  )}
                  {!form.tariff2Enabled && (
                    <p className="text-xs text-slate-400">Tariff 2 is disabled. Only Tariff 1 will be billed.</p>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Tariff 3</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-slate-500">{form.tariff3Enabled ? "Enabled" : "Disabled"}</span>
                      <div
                        onClick={() => setForm(f => ({ ...f, tariff3Enabled: !f.tariff3Enabled }))}
                        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${form.tariff3Enabled ? "bg-blue-600" : "bg-slate-300"}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${form.tariff3Enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                      </div>
                    </label>
                  </div>
                  {form.tariff3Enabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Label" value={form.tariff3Label} onChange={(v) => setForm({ ...form, tariff3Label: v })} placeholder="Tariff 3" />
                      <Field label="Rate (£/kWh)" type="number" value={form.tariff3RatePerKwh} onChange={(v) => setForm({ ...form, tariff3RatePerKwh: v })} placeholder="0.000000" required />
                    </div>
                  )}
                  {!form.tariff3Enabled && <p className="text-xs text-slate-400">Tariff 3 is disabled.</p>}
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Tariff 4</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-slate-500">{form.tariff4Enabled ? "Enabled" : "Disabled"}</span>
                      <div
                        onClick={() => setForm(f => ({ ...f, tariff4Enabled: !f.tariff4Enabled }))}
                        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${form.tariff4Enabled ? "bg-blue-600" : "bg-slate-300"}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${form.tariff4Enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                      </div>
                    </label>
                  </div>
                  {form.tariff4Enabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Label" value={form.tariff4Label} onChange={(v) => setForm({ ...form, tariff4Label: v })} placeholder="Tariff 4" />
                      <Field label="Rate (£/kWh)" type="number" value={form.tariff4RatePerKwh} onChange={(v) => setForm({ ...form, tariff4RatePerKwh: v })} placeholder="0.000000" required />
                    </div>
                  )}
                  {!form.tariff4Enabled && <p className="text-xs text-slate-400">Tariff 4 is disabled.</p>}
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Standing Charge (£/day)" type="number" value={form.standingChargePerDay} onChange={(v) => setForm({ ...form, standingChargePerDay: v })} placeholder="0.60" required />
                    <Field label="VAT Rate (%)" type="number" value={form.vatRate} onChange={(v) => setForm({ ...form, vatRate: v })} placeholder="5" required />
                  </div>
                </div>

                <Field label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Optional notes about this tariff period" />
              </div>
              <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button onClick={save} disabled={loading || !form.name || !form.tariff1RatePerKwh || (form.tariff2Enabled && !form.tariff2RatePerKwh)} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                  {loading ? "Saving..." : editId ? "Update Tariff" : "Create Tariff"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function RateCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    purple: "bg-purple-50 text-purple-700",
    green: "bg-green-50 text-green-700",
    orange: "bg-orange-50 text-orange-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-50 text-slate-700",
  };
  return (
    <div className={`rounded-lg p-3 ${colors[color] ?? colors.slate}`}>
      <div className="text-xs font-medium opacity-70 mb-1">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs opacity-60">{sub}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input type={type} step="any" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={placeholder} />
    </div>
  );
}
