"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, User, Search, Gauge, CalendarClock, Server, Link2Off, RotateCcw, Zap } from "lucide-react";
import AppShell from "@/components/AppShell";
import { toast } from "sonner";
import { formatDate } from "@/lib/format-date";
import type { Customer, TariffRate, CustomerTariffSchedule, Meter } from "@/lib/types";

const EMPTY_CUSTOMER: Omit<Customer, "id" | "createdAt" | "lastAutoBilledAt"> = {
  name: "",
  email: "",
  address: "",
  accountNumber: "",
  tariffPlanId: "",
  notes: "",
  autoBillingEnabled: undefined,
  billingMode: undefined,
  billingDayOfMonth: undefined,
  billingIntervalDays: undefined,
  billingDayOfWeek: undefined,
};


export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tariffs, setTariffs] = useState<TariffRate[]>([]);
  const [meterCounts, setMeterCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_CUSTOMER });
  const [loading, setLoading] = useState(false);
  const [billingNow, setBillingNow] = useState(false);
  const [initialReading, setInitialReading] = useState({ enabled: false, date: new Date().toISOString().substring(0, 10), t1Kwh: "", t2Kwh: "" });
  const [scheduleCustomer, setScheduleCustomer] = useState<Customer | null>(null);
  const [metersCustomer, setMetersCustomer] = useState<Customer | null>(null);

  async function load() {
    const [c, t, m] = await Promise.all([
      fetch("/api/customers").then(r => r.json()),
      fetch("/api/tariffs").then(r => r.json()),
      fetch("/api/meters").then(r => r.json()),
    ]);
    setCustomers(c);
    setTariffs(t);
    const counts: Record<string, number> = {};
    for (const meter of m as Meter[]) {
      if (meter.customerId) counts[meter.customerId] = (counts[meter.customerId] ?? 0) + 1;
    }
    setMeterCounts(counts);
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditId(null);
    setForm({ ...EMPTY_CUSTOMER });
    setInitialReading({ enabled: false, date: new Date().toISOString().substring(0, 10), t1Kwh: "", t2Kwh: "" });
    setShowForm(true);
  }

  function openEdit(c: Customer) {
    setEditId(c.id);
    setForm({
      name: c.name,
      email: c.email,
      address: c.address,
      accountNumber: c.accountNumber,
      tariffPlanId: c.tariffPlanId,
      notes: c.notes ?? "",
      autoBillingEnabled: c.autoBillingEnabled,
      billingMode: c.billingMode,
      billingDayOfMonth: c.billingDayOfMonth,
      billingIntervalDays: c.billingIntervalDays,
      billingDayOfWeek: c.billingDayOfWeek,
    });
    setShowForm(true);
  }

  async function save() {
    setLoading(true);
    try {
      if (editId) {
        await fetch(`/api/customers/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        toast.success("Customer updated");
      } else {
        const res = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const created = await res.json();
        if (initialReading.enabled && initialReading.t1Kwh !== "" && initialReading.t2Kwh !== "") {
          await fetch("/api/readings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerId: created.id,
              readingDate: new Date(initialReading.date).toISOString(),
              tariff1Kwh: parseFloat(initialReading.t1Kwh),
              tariff2Kwh: parseFloat(initialReading.t2Kwh),
              readMethod: "manual",
              notes: "Initial reading",
            }),
          });
          toast.success("Customer created with initial reading");
        } else {
          toast.success("Customer created");
        }
      }
      setShowForm(false);
      load();
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this customer?")) return;
    await fetch(`/api/customers/${id}`, { method: "DELETE" });
    toast.success("Customer deleted");
    load();
  }

  async function billNow() {
    if (!editId) return;
    setBillingNow(true);
    try {
      const r = await fetch(`/api/customers/${editId}/bill-now`, { method: "POST" });
      const result = await r.json();
      if (!r.ok) {
        toast.error(result.error ?? "Failed to run billing");
        return;
      }
      if (result.generated === 0) {
        const reasons = result.results.map((x: { meter: string; error?: string }) => x.error).filter(Boolean);
        toast.warning(`No bills generated: ${reasons.join("; ")}`);
      } else {
        toast.success(`${result.generated} bill${result.generated !== 1 ? "s" : ""} generated`);
        if (result.failed > 0) toast.warning(`${result.failed} meter(s) skipped — check readings/tariff`);
      }
      load();
    } finally {
      setBillingNow(false);
    }
  }

  async function resetBillingCycle(id: string) {
    await fetch(`/api/customers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastAutoBilledAt: null }),
    });
    toast.success("Billing cycle reset — scheduler will bill on next run");
    load();
  }

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.accountNumber.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
            <p className="text-slate-500 text-sm mt-1">{customers.length} customer{customers.length !== 1 ? "s" : ""} registered</p>
          </div>
          <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
            <User className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No customers yet. Add your first customer to get started.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Account #</th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Email</th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Meters</th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Tariff</th>
                  <th className="text-right px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((c) => {
                  const assignedTariff = tariffs.find(t => t.id === c.tariffPlanId);
                  const count = meterCounts[c.id] ?? 0;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4 font-medium text-slate-900">{c.name}</td>
                      <td className="px-5 py-4 text-slate-600 font-mono text-xs">{c.accountNumber}</td>
                      <td className="px-5 py-4 text-slate-600">{c.email}</td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => setMetersCustomer(c)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 text-xs font-medium transition-colors"
                        >
                          <Server className="w-3 h-3" />
                          {count === 0 ? "No meters" : `${count} meter${count !== 1 ? "s" : ""}`}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-slate-600 text-xs">{assignedTariff ? <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-medium">{assignedTariff.name}</span> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setScheduleCustomer(c)} title="Tariff schedule" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-purple-600 transition-colors">
                            <CalendarClock className="w-4 h-4" />
                          </button>
                          {c.lastAutoBilledAt && (
                            <button
                              onClick={() => resetBillingCycle(c.id)}
                              title={`Reset billing cycle (last billed: ${formatDate(c.lastAutoBilledAt!)})`}
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-500 hover:text-amber-600 transition-colors"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => remove(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Customer Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-900">{editId ? "Edit Customer" : "New Customer"}</h2>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Full Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
                  <Field label="Account Number" value={form.accountNumber} onChange={(v) => setForm({ ...form, accountNumber: v })} placeholder="e.g. ACC-001" required />
                </div>
                <Field label="Email Address" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
                <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} textarea />

                <div className="border-t border-slate-100 pt-4">
                  <div className="mb-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Default Tariff Plan</label>
                    <select
                      value={form.tariffPlanId}
                      onChange={(e) => setForm({ ...form, tariffPlanId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No default tariff</option>
                      {tariffs.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">Pre-selects this tariff when generating a bill for this customer.</p>
                  </div>
                </div>

                {!editId && (
                  <div className="border-t border-slate-100 pt-4">
                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                      <div
                        onClick={() => setInitialReading(r => ({ ...r, enabled: !r.enabled }))}
                        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${initialReading.enabled ? "bg-blue-600" : "bg-slate-300"}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${initialReading.enabled ? "translate-x-6" : "translate-x-1"}`} />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-slate-800 flex items-center gap-2">
                          <Gauge className="w-4 h-4 text-green-500" /> Add Initial Meter Reading
                        </span>
                        <p className="text-xs text-slate-400 mt-0.5">Saved as the opening reading for the first bill</p>
                      </div>
                    </label>

                    {initialReading.enabled && (
                      <div className="grid grid-cols-3 gap-3 mt-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1.5">Date</label>
                          <input
                            type="date"
                            value={initialReading.date}
                            onChange={(e) => setInitialReading(r => ({ ...r, date: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1.5">T1 (kWh)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={initialReading.t1Kwh}
                            onChange={(e) => setInitialReading(r => ({ ...r, t1Kwh: e.target.value }))}
                            placeholder="0.00"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1.5">T2 (kWh)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={initialReading.t2Kwh}
                            onChange={(e) => setInitialReading(r => ({ ...r, t2Kwh: e.target.value }))}
                            placeholder="0.00"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Field label="Notes" value={form.notes ?? ""} onChange={(v) => setForm({ ...form, notes: v })} textarea />

                {/* Billing Schedule */}
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Auto-Billing Schedule</p>
                    {editId && (
                      <button
                        type="button"
                        onClick={billNow}
                        disabled={billingNow}
                        title="Generate bills immediately for all meters on this customer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        {billingNow
                          ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <Zap className="w-3 h-3" />}
                        {billingNow ? "Billing…" : "Bill Now"}
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Schedule</label>
                      <select
                        value={form.autoBillingEnabled === false ? "disabled" : form.billingMode ? "custom" : "global"}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "global") setForm({ ...form, autoBillingEnabled: undefined, billingMode: undefined, billingDayOfMonth: undefined, billingIntervalDays: undefined, billingDayOfWeek: undefined });
                          else if (v === "disabled") setForm({ ...form, autoBillingEnabled: false, billingMode: undefined });
                          else setForm({ ...form, autoBillingEnabled: undefined, billingMode: form.billingMode ?? "day-of-month" });
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="global">Use global setting</option>
                        <option value="disabled">Never auto-bill</option>
                        <option value="custom">Custom schedule</option>
                      </select>
                    </div>

                    {form.autoBillingEnabled !== false && form.billingMode && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1.5">Billing Mode</label>
                          <select
                            value={form.billingMode ?? "day-of-month"}
                            onChange={(e) => setForm({ ...form, billingMode: e.target.value as Customer["billingMode"] })}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="day-of-month">Day of month</option>
                            <option value="weekly">Weekly</option>
                            <option value="interval-days">Every N days</option>
                          </select>
                        </div>

                        {form.billingMode === "day-of-month" && (
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1.5">Day of month <span className="text-slate-400">(1–28)</span></label>
                            <input
                              type="number" min={1} max={28}
                              value={form.billingDayOfMonth ?? ""}
                              onChange={(e) => setForm({ ...form, billingDayOfMonth: e.target.value ? parseInt(e.target.value) : undefined })}
                              placeholder="e.g. 1"
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        )}

                        {form.billingMode === "weekly" && (
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1.5">Billing day</label>
                            <select
                              value={form.billingDayOfWeek ?? 1}
                              onChange={(e) => setForm({ ...form, billingDayOfWeek: parseInt(e.target.value) })}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d, i) => (
                                <option key={i} value={i}>{d}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {form.billingMode === "interval-days" && (
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1.5">Interval <span className="text-slate-400">(days)</span></label>
                            <input
                              type="number" min={1}
                              value={form.billingIntervalDays ?? ""}
                              onChange={(e) => setForm({ ...form, billingIntervalDays: e.target.value ? parseInt(e.target.value) : undefined })}
                              placeholder="e.g. 7 for weekly, 30 for monthly"
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button onClick={save} disabled={loading || !form.name || !form.email} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                  {loading ? "Saving..." : editId ? "Update" : "Create Customer"}
                </button>
              </div>
            </div>
          </div>
        )}

        {scheduleCustomer && (
          <TariffScheduleModal
            customer={scheduleCustomer}
            tariffs={tariffs}
            onClose={() => setScheduleCustomer(null)}
          />
        )}

        {metersCustomer && (
          <MetersModal
            customer={metersCustomer}
            onClose={() => { setMetersCustomer(null); load(); }}
          />
        )}
      </div>
    </AppShell>
  );
}

function MetersModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [assigned, setAssigned] = useState<Meter[]>([]);
  const [unassigned, setUnassigned] = useState<Meter[]>([]);
  const [assignSearch, setAssignSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function loadMeters() {
    const [a, u] = await Promise.all([
      fetch(`/api/meters?customerId=${customer.id}`).then(r => r.json()),
      fetch(`/api/meters?unassigned=true`).then(r => r.json()),
    ]);
    setAssigned(a);
    setUnassigned(u);
  }

  useEffect(() => { loadMeters(); }, []);

  async function unassignMeter(id: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/meters/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: null }),
      });
      if (r.ok) { toast.success("Meter unassigned"); loadMeters(); }
      else { const e = await r.json(); toast.error(e.error ?? "Failed"); }
    } finally { setBusy(null); }
  }

  async function assignMeter(id: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/meters/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id }),
      });
      if (r.ok) { toast.success("Meter assigned"); setAssignSearch(""); loadMeters(); }
      else { const e = await r.json(); toast.error(e.error ?? "Failed"); }
    } finally { setBusy(null); }
  }

  const filteredUnassigned = unassigned.filter(m =>
    !assignSearch ||
    (m.serialNumber ?? "").toLowerCase().includes(assignSearch.toLowerCase()) ||
    m.name.toLowerCase().includes(assignSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Manage Meters</h2>
            <p className="text-xs text-slate-500 mt-0.5">{customer.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Assigned meters */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Assigned Meters</p>
            {assigned.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">No meters assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {assigned.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50">
                    <Server className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">{m.name}</p>
                      <p className="text-xs text-slate-500 font-mono">
                        {m.serialNumber && <span className="mr-2 text-slate-600">{m.serialNumber}</span>}
                        {m.meterIp}:{m.meterPort} · Unit {m.meterUnitId}
                      </p>
                    </div>
                    <button
                      onClick={() => unassignMeter(m.id)}
                      disabled={busy === m.id}
                      title="Unassign from customer"
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40"
                    >
                      <Link2Off className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assign from registry */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Assign from Registry</p>
            <input
              type="text"
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              placeholder="Search by serial number or name..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {filteredUnassigned.length === 0 ? (
              <p className="text-sm text-slate-400 py-1">
                {unassigned.length === 0
                  ? "No unassigned meters in the registry."
                  : "No meters match your search."}
              </p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {filteredUnassigned.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
                    <Server className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">{m.name}</p>
                      <p className="text-xs text-slate-500 font-mono">
                        {m.serialNumber && <span className="mr-2">{m.serialNumber}</span>}
                        {m.meterIp}:{m.meterPort}
                      </p>
                    </div>
                    <button
                      onClick={() => assignMeter(m.id)}
                      disabled={busy === m.id}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      Assign
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-3">
              Need to register a new meter?{" "}
              <a href="/meters" className="text-blue-600 hover:underline">Go to the Meters registry →</a>
            </p>
          </div>
        </div>

        <div className="flex justify-end p-6 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

function TariffScheduleModal({ customer, tariffs, onClose }: {
  customer: Customer;
  tariffs: TariffRate[];
  onClose: () => void;
}) {
  const [schedules, setSchedules] = useState<CustomerTariffSchedule[]>([]);
  const [addDate, setAddDate] = useState(new Date().toISOString().substring(0, 10));
  const [addTariff, setAddTariff] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch(`/api/customer-tariff-schedules?customerId=${customer.id}`);
    setSchedules(await r.json());
  }

  useEffect(() => { load(); }, []);

  async function addSchedule() {
    if (!addTariff || !addDate) return;
    setSaving(true);
    try {
      await fetch("/api/customer-tariff-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id, tariffRateId: addTariff, effectiveFrom: addDate, notes: addNotes || undefined }),
      });
      toast.success("Tariff change scheduled");
      setAddDate(new Date().toISOString().substring(0, 10));
      setAddTariff("");
      setAddNotes("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/customer-tariff-schedules/${id}`, { method: "DELETE" });
    toast.success("Schedule removed");
    load();
  }

  const defaultTariff = tariffs.find(t => t.id === customer.tariffPlanId);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Tariff Schedule</h2>
            <p className="text-xs text-slate-500 mt-0.5">{customer.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Current Schedule</p>
            <div className="space-y-1">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 text-sm">
                <div className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                <span className="text-slate-500 text-xs w-24 flex-shrink-0">Default</span>
                <span className="font-medium text-slate-700">{defaultTariff?.name ?? <span className="text-slate-400 italic">No default tariff</span>}</span>
              </div>
              {schedules.map((s) => {
                const tariff = tariffs.find(t => t.id === s.tariffRateId);
                const isNext = new Date(s.effectiveFrom) > new Date();
                return (
                  <div key={s.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${isNext ? "bg-purple-50" : "bg-blue-50"}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isNext ? "bg-purple-400" : "bg-blue-400"}`} />
                    <span className={`text-xs w-24 flex-shrink-0 ${isNext ? "text-purple-600" : "text-blue-600"}`}>
                      {isNext ? "↑ " : ""}{formatDate(s.effectiveFrom)}
                    </span>
                    <span className="font-medium text-slate-700 flex-1">{tariff?.name ?? "Unknown tariff"}</span>
                    {s.notes && <span className="text-xs text-slate-400 italic truncate max-w-[100px]">{s.notes}</span>}
                    <button onClick={() => remove(s.id)} className="ml-auto p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              {schedules.length === 0 && (
                <p className="text-xs text-slate-400 px-3 py-2">No scheduled tariff changes yet.</p>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Schedule a Tariff Change</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Effective From</label>
                <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">New Tariff</label>
                <select value={addTariff} onChange={e => setAddTariff(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select tariff...</option>
                  {tariffs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes <span className="text-slate-400">(optional)</span></label>
              <input type="text" value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="e.g. New contract rate" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Close</button>
          <button onClick={addSchedule} disabled={saving || !addTariff || !addDate} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? "Saving..." : "Add to Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, required, textarea
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
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
