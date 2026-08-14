"use client";

import { useEffect, useState } from "react";
import { Plus, FileText, Send, Download, Trash2, Eye, CheckCircle, Clock, RefreshCw, AlertTriangle, RotateCcw } from "lucide-react";
import AppShell from "@/components/AppShell";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";
import { resolveActiveTariffId } from "@/lib/tariff-schedule";
import type { Bill, Customer, TariffRate, MeterReading, CustomerTariffSchedule, Meter } from "@/lib/types";

const statusColors: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  draft: { bg: "bg-slate-100", text: "text-slate-600", icon: Clock },
  sent: { bg: "bg-blue-100", text: "text-blue-700", icon: Send },
  paid: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle },
};

export default function BillsPage() {
  const [bills, setBills] = useState<(Bill & { customerName?: string })[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tariffs, setTariffs] = useState<TariffRate[]>([]);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [tariffSchedules, setTariffSchedules] = useState<CustomerTariffSchedule[]>([]);
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "draft" | "sent" | "paid">("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [viewBill, setViewBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    customerId: "",
    meterId: "",
    tariffRateId: "",
    billingPeriodStart: "",
    billingPeriodEnd: "",
    openingReadingId: "",
    closingReadingId: "",
  });

  async function load() {
    const [b, c, t, r, s, m] = await Promise.all([
      fetch("/api/bills").then(r => r.json()),
      fetch("/api/customers").then(r => r.json()),
      fetch("/api/tariffs").then(r => r.json()),
      fetch("/api/readings").then(r => r.json()),
      fetch("/api/customer-tariff-schedules").then(r => r.json()),
      fetch("/api/meters").then(r => r.json()),
    ]);
    const customerMap = Object.fromEntries((c as Customer[]).map(x => [x.id, x.name]));
    setBills((b as Bill[]).map(bill => ({ ...bill, customerName: customerMap[bill.customerId] ?? "Unknown" })));
    setCustomers(c);
    setTariffs(t);
    setReadings(r);
    setTariffSchedules(s);
    setMeters(m);
    setSelected(new Set());
  }

  function getActiveTariffId(customerId: string, date: string): string {
    return resolveActiveTariffId(customerId, date, tariffSchedules, customers);
  }

  useEffect(() => { load(); }, []);

  const customerMeters = form.customerId ? meters.filter(m => m.customerId === form.customerId) : [];

  const customerReadings = readings
    .filter(r => r.customerId === form.customerId && (!form.meterId || r.meterId === form.meterId))
    .sort((a, b) => a.readingDate.localeCompare(b.readingDate));

  // Opening reading options: readings within [billingPeriodStart, billingPeriodEnd]
  const openingReadingOptions = customerReadings.filter(r => {
    const d = r.readingDate.substring(0, 10);
    if (form.billingPeriodStart && d < form.billingPeriodStart) return false;
    if (form.billingPeriodEnd && d > form.billingPeriodEnd) return false;
    return true;
  });

  // Closing reading options: readings within [billingPeriodStart, billingPeriodEnd], excluding the opening reading
  const closingReadingOptions = customerReadings.filter(r => {
    if (r.id === form.openingReadingId) return false;
    const d = r.readingDate.substring(0, 10);
    if (form.billingPeriodStart && d < form.billingPeriodStart) return false;
    if (form.billingPeriodEnd && d > form.billingPeriodEnd) return false;
    return true;
  });

  const meterMap = Object.fromEntries(meters.map(m => [m.id, m]));

  async function generate() {
    if (!form.customerId || !form.tariffRateId || !form.billingPeriodStart || !form.billingPeriodEnd || !form.openingReadingId || !form.closingReadingId) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: form.customerId,
          meterId: form.meterId || undefined,
          tariffRateId: form.tariffRateId,
          billingPeriodStart: form.billingPeriodStart,
          billingPeriodEnd: form.billingPeriodEnd,
          openingReadingId: form.openingReadingId,
          closingReadingId: form.closingReadingId,
        }),
      });
      if (!r.ok) {
        const e = await r.json();
        toast.error(e.error ?? "Failed to generate bill");
        return;
      }
      toast.success("Bill generated successfully");
      setShowForm(false);
      load();
    } finally {
      setLoading(false);
    }
  }

  async function sendBill(id: string) {
    setSendingId(id);
    try {
      const r = await fetch(`/api/bills/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      const result = await r.json();
      if (r.ok) {
        toast.success("Bill sent successfully");
        load();
      } else {
        toast.error(result.error ?? "Failed to send bill");
      }
    } finally {
      setSendingId(null);
    }
  }

  async function resendBill(id: string) {
    setResendingId(id);
    try {
      const r = await fetch(`/api/bills/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend" }),
      });
      const result = await r.json();
      if (r.ok) {
        toast.success("Bill re-sent successfully");
        load();
      } else {
        toast.error(result.error ?? "Failed to re-send bill");
      }
    } finally {
      setResendingId(null);
    }
  }

  async function markPaid(id: string) {
    await fetch(`/api/bills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid" }),
    });
    toast.success("Marked as paid");
    load();
  }

  async function regeneratePdf(id: string) {
    const r = await fetch(`/api/bills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "regenerate-pdf" }),
    });
    if (r.ok) { toast.success("PDF regenerated"); load(); }
    else toast.error("Failed to regenerate PDF");
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} bill(s)? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const r = await fetch("/api/bills", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (r.ok) {
        toast.success(`Deleted ${selected.size} bill(s)`);
        load();
      } else {
        const e = await r.json();
        toast.error(e.error ?? "Failed to delete bills");
      }
    } finally {
      setDeleting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this bill?")) return;
    await fetch(`/api/bills/${id}`, { method: "DELETE" });
    toast.success("Bill deleted");
    load();
  }

  async function downloadPdf(bill: Bill & { customerName?: string }) {
    if (!bill.pdfBase64 && !bill.pdfFilePath) { toast.error("No PDF available – try regenerating"); return; }
    try {
      const resp = await fetch(`/api/bills/${bill.id}/pdf`);
      if (!resp.ok) { toast.error("No PDF available – try regenerating"); return; }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${bill.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download PDF");
    }
  }

  function openPreview(bill: Bill) {
    setViewBill(bill);
  }

  const displayedBills = bills.filter((b) => {
    if (filterCustomer && b.customerId !== filterCustomer) return false;
    if (filterStatus && b.status !== filterStatus) return false;
    if (filterDateFrom && b.billingPeriodStart.substring(0, 10) < filterDateFrom) return false;
    if (filterDateTo && b.billingPeriodEnd.substring(0, 10) > filterDateTo) return false;
    return true;
  });

  return (
    <AppShell>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Bills</h1>
            <p className="text-slate-500 text-sm mt-1">{displayedBills.length}{displayedBills.length !== bills.length ? ` of ${bills.length}` : ""} bill{bills.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Generate Bill
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Customers</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "" | "draft" | "sent" | "paid")}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
          </select>

          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            title="Billing period from"
            className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-slate-400 text-sm">–</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            title="Billing period to"
            className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-sm text-blue-700 font-medium">{selected.size} selected</span>
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-blue-600 hover:underline ml-auto"
            >
              Clear selection
            </button>
          </div>
        )}

        {displayedBills.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">{bills.length === 0 ? "No bills yet." : "No bills match the current filters."}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={displayedBills.length > 0 && displayedBills.every(b => selected.has(b.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelected(new Set(displayedBills.map(b => b.id)));
                        else setSelected(new Set());
                      }}
                      className="rounded border-slate-300"
                    />
                  </th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Customer</th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Period</th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Generated</th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Status</th>
                  <th className="text-right px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Total</th>
                  <th className="text-right px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayedBills.map((b) => {
                  const { bg, text, icon: Icon } = statusColors[b.status] ?? statusColors.draft;
                  return (
                    <tr key={b.id} className={`hover:bg-slate-50 transition-colors ${selected.has(b.id) ? "bg-blue-50" : ""}`}>
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(b.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(b.id); else next.delete(b.id);
                            setSelected(next);
                          }}
                          className="rounded border-slate-300"
                        />
                      </td>
                      <td className="px-5 py-3.5 font-medium text-slate-900">{b.customerName}</td>
                      <td className="px-5 py-3.5 text-slate-600 text-xs">
                        {format(new Date(b.billingPeriodStart), "dd/MM/yy")} – {format(new Date(b.billingPeriodEnd), "dd/MM/yy")}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">{format(new Date(b.generatedAt), "dd/MM/yyyy")}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${bg} ${text}`}>
                            <Icon className="w-3 h-3" />
                            {b.status}
                          </span>
                          {b.emailError && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5" title={b.emailError}>
                              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                              Email failed
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-slate-900">£{b.total.toFixed(2)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openPreview(b)} title="Preview" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => downloadPdf(b)} title="Download PDF" disabled={!b.pdfBase64 && !b.pdfFilePath} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-green-600 transition-colors disabled:opacity-30">
                            <Download className="w-4 h-4" />
                          </button>
                          <button onClick={() => regeneratePdf(b.id)} title="Regenerate PDF" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-amber-600 transition-colors">
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          {b.status !== "sent" && b.status !== "paid" && (
                            <button
                              onClick={() => sendBill(b.id)}
                              disabled={sendingId === b.id}
                              title="Send by email"
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-50"
                            >
                              {sendingId === b.id ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                          )}
                          {(b.status === "sent" || b.status === "paid") && (
                            <button
                              onClick={() => resendBill(b.id)}
                              disabled={resendingId === b.id}
                              title="Re-send by email"
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-50"
                            >
                              {resendingId === b.id ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                            </button>
                          )}
                          {b.status === "sent" && (
                            <button onClick={() => markPaid(b.id)} title="Mark as paid" className="p-1.5 rounded-lg hover:bg-green-50 text-slate-500 hover:text-green-600 transition-colors">
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => remove(b.id)} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors">
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

        {/* Generate Bill Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-900">Generate Bill</h2>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Customer <span className="text-red-500">*</span></label>
                  <select
                    value={form.customerId}
                    onChange={(e) => {
                      const cid = e.target.value;
                      const customer = customers.find(c => c.id === cid);
                      const custMeters = meters.filter(m => m.customerId === cid);
                      const autoMeterId = custMeters.length === 1 ? custMeters[0].id : "";
                      const custReadings = readings
                        .filter(r => r.customerId === cid && (!autoMeterId || r.meterId === autoMeterId))
                        .sort((a, b) => a.readingDate.localeCompare(b.readingDate));
                      const latestBill = bills
                        .filter(b => b.customerId === cid && (!autoMeterId || b.meterId === autoMeterId))
                        .sort((a, b) => b.billingPeriodEnd.localeCompare(a.billingPeriodEnd))[0];
                      const startDate = latestBill
                        ? latestBill.billingPeriodEnd.substring(0, 10)
                        : custReadings[0]?.readingDate.substring(0, 10) ?? "";
                      const openingMatch = startDate
                        ? custReadings.find(r => r.readingDate.startsWith(startDate))
                        : undefined;
                      const activeTariff = startDate
                        ? getActiveTariffId(cid, startDate)
                        : (customer?.tariffPlanId ?? "");
                      setForm({
                        ...form,
                        customerId: cid,
                        meterId: autoMeterId,
                        tariffRateId: activeTariff || form.tariffRateId,
                        billingPeriodStart: startDate,
                        billingPeriodEnd: "",
                        openingReadingId: openingMatch?.id ?? "",
                        closingReadingId: "",
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select customer...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {form.customerId && customerMeters.length === 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                    This customer has no meters configured. Add meters via the Customers page first.
                  </div>
                )}

                {form.customerId && customerMeters.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Meter <span className="text-red-500">*</span></label>
                    <select
                      value={form.meterId}
                      onChange={(e) => {
                        const mid = e.target.value;
                        const meterReadings = readings
                          .filter(r => r.customerId === form.customerId && (!mid || r.meterId === mid))
                          .sort((a, b) => a.readingDate.localeCompare(b.readingDate));
                        const latestBill = bills
                          .filter(b => b.customerId === form.customerId && (!mid || b.meterId === mid))
                          .sort((a, b) => b.billingPeriodEnd.localeCompare(a.billingPeriodEnd))[0];
                        const startDate = latestBill
                          ? latestBill.billingPeriodEnd.substring(0, 10)
                          : meterReadings[0]?.readingDate.substring(0, 10) ?? "";
                        const openingMatch = startDate ? meterReadings.find(r => r.readingDate.startsWith(startDate)) : undefined;
                        setForm({ ...form, meterId: mid, billingPeriodStart: startDate, billingPeriodEnd: "", openingReadingId: openingMatch?.id ?? "", closingReadingId: "" });
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select meter...</option>
                      {customerMeters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Tariff Rate <span className="text-red-500">*</span></label>
                  <select value={form.tariffRateId} onChange={(e) => setForm({ ...form, tariffRateId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select tariff...</option>
                    {tariffs.map(t => <option key={t.id} value={t.id}>{t.name} (from {format(new Date(t.effectiveFrom), "dd/MM/yyyy")})</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Billing Period Start <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={form.billingPeriodStart}
                      onChange={(e) => {
                        const date = e.target.value;
                        const match = customerReadings.find(r => r.readingDate.startsWith(date));
                        const activeTariff = form.customerId ? getActiveTariffId(form.customerId, date) : form.tariffRateId;
                        // Clear reading selections that fall before the new start date
                        const openingReading = readings.find(r => r.id === form.openingReadingId);
                        const closingReading = readings.find(r => r.id === form.closingReadingId);
                        const keepOpening = openingReading && openingReading.readingDate.substring(0, 10) >= date;
                        const keepClosing = closingReading && closingReading.readingDate.substring(0, 10) >= date;
                        setForm({
                          ...form,
                          billingPeriodStart: date,
                          openingReadingId: match ? match.id : (keepOpening ? form.openingReadingId : ""),
                          closingReadingId: keepClosing ? form.closingReadingId : "",
                          tariffRateId: activeTariff || form.tariffRateId,
                        });
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Billing Period End <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={form.billingPeriodEnd}
                      onChange={(e) => {
                        const date = e.target.value;
                        const match = customerReadings.find(r => r.readingDate.startsWith(date));
                        // Clear reading selections that fall after the new end date
                        const openingReading = readings.find(r => r.id === form.openingReadingId);
                        const closingReading = readings.find(r => r.id === form.closingReadingId);
                        const keepOpening = openingReading && openingReading.readingDate.substring(0, 10) <= date;
                        const keepClosing = closingReading && closingReading.readingDate.substring(0, 10) <= date;
                        setForm({
                          ...form,
                          billingPeriodEnd: date,
                          openingReadingId: keepOpening ? form.openingReadingId : "",
                          closingReadingId: match ? match.id : (keepClosing ? form.closingReadingId : ""),
                        });
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {form.customerId && customerReadings.length < 2 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                    {form.meterId
                      ? "This meter needs at least 2 readings to generate a bill. Add readings first."
                      : "Select a meter — it needs at least 2 readings to generate a bill."}
                  </div>
                )}

                {form.customerId && customerReadings.length >= 2 && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Opening Reading <span className="text-red-500">*</span></label>
                      <select value={form.openingReadingId} onChange={(e) => setForm({ ...form, openingReadingId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Select opening reading...</option>
                        {openingReadingOptions.map(r => (
                          <option key={r.id} value={r.id}>
                            {format(new Date(r.readingDate), "dd/MM/yyyy")} — T1: {r.tariff1Kwh} | T2: {r.tariff2Kwh}{r.tariff3Kwh !== undefined ? ` | T3: ${r.tariff3Kwh}` : ""}{r.tariff4Kwh !== undefined ? ` | T4: ${r.tariff4Kwh}` : ""} kWh
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Closing Reading <span className="text-red-500">*</span></label>
                      <select value={form.closingReadingId} onChange={(e) => setForm({ ...form, closingReadingId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Select closing reading...</option>
                        {closingReadingOptions.map(r => (
                          <option key={r.id} value={r.id}>
                            {format(new Date(r.readingDate), "dd/MM/yyyy")} — T1: {r.tariff1Kwh} | T2: {r.tariff2Kwh}{r.tariff3Kwh !== undefined ? ` | T3: ${r.tariff3Kwh}` : ""}{r.tariff4Kwh !== undefined ? ` | T4: ${r.tariff4Kwh}` : ""} kWh
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button onClick={generate} disabled={loading} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                  {loading ? "Generating..." : "Generate Bill"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bill Preview Modal */}
        {viewBill && (
          <BillPreviewModal bill={viewBill} onClose={() => setViewBill(null)} onDownload={() => { downloadPdf(viewBill); }} />
        )}
      </div>
    </AppShell>
  );
}

function BillPreviewModal({ bill, onClose, onDownload }: { bill: Bill; onClose: () => void; onDownload: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Bill Summary</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
        </div>
        <div className="p-6 space-y-3 text-sm">
          <Row label="Invoice #" value={bill.id.toUpperCase()} />
          <Row label="Period" value={`${format(new Date(bill.billingPeriodStart), "dd/MM/yyyy")} – ${format(new Date(bill.billingPeriodEnd), "dd/MM/yyyy")}`} />
          <div className="border-t border-slate-100 pt-3 mt-3">
            <Row label={`Tariff 1 (${bill.tariff1Usage.toFixed(2)} kWh)`} value={formatCurrency(bill.tariff1Cost)} />
            <Row label={`Tariff 2 (${bill.tariff2Usage.toFixed(2)} kWh)`} value={formatCurrency(bill.tariff2Cost)} />
            {bill.tariff3Usage !== undefined && <Row label={`Tariff 3 (${bill.tariff3Usage.toFixed(2)} kWh)`} value={formatCurrency((bill.tariff3Cost ?? 0))} />}
            {bill.tariff4Usage !== undefined && <Row label={`Tariff 4 (${bill.tariff4Usage.toFixed(2)} kWh)`} value={formatCurrency((bill.tariff4Cost ?? 0))} />}
            <Row label="Standing Charge" value={formatCurrency(bill.standingCharge)} />
            <Row label="Subtotal" value={formatCurrency(bill.subtotal)} />
            <Row label="VAT" value={formatCurrency(bill.vat)} />
          </div>
          <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
            <span className="font-bold text-slate-900 text-base">Total Due</span>
            <span className="font-bold text-blue-700 text-lg">£{bill.total.toFixed(2)}</span>
          </div>
          {bill.emailError && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 mt-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Email failed to send</p>
                <p className="mt-0.5 text-amber-700">{bill.emailError}</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Close</button>
          <button onClick={onDownload} disabled={!bill.pdfBase64 && !bill.pdfFilePath} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            <Download className="w-4 h-4" /> Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium">{value}</span>
    </div>
  );
}
