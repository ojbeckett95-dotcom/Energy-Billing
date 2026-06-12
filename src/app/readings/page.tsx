"use client";

import { useEffect, useState, useRef } from "react";
import { Plus, Trash2, Activity, Wifi, RefreshCw, Pencil, Download, Upload } from "lucide-react";
import AppShell from "@/components/AppShell";
import { toast } from "sonner";
import { format } from "date-fns";
import type { MeterReading, Customer, Meter } from "@/lib/types";

const nowForInput = () => format(new Date(), "yyyy-MM-dd'T'HH:mm");

export default function ReadingsPage() {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterMeter, setFilterMeter] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "billed" | "unbilled">("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);
  const [markingBilled, setMarkingBilled] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [editReading, setEditReading] = useState<MeterReading | null>(null);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const [form, setForm] = useState({
    customerId: "",
    meterId: "",
    readingDate: nowForInput(),
    tariff1Kwh: "",
    tariff2Kwh: "",
    tariff3Kwh: "",
    tariff4Kwh: "",
    readMethod: "manual" as "manual" | "modbus",
    notes: "",
  });

  const [editForm, setEditForm] = useState({
    readingDate: nowForInput(),
    tariff1Kwh: "",
    tariff2Kwh: "",
    tariff3Kwh: "",
    tariff4Kwh: "",
    readMethod: "manual" as "manual" | "modbus",
    notes: "",
  });

  async function load() {
    const params = new URLSearchParams();
    if (filterMeter) params.set("meterId", filterMeter);
    else if (filterCustomer) params.set("customerId", filterCustomer);
    if (showArchived) params.set("archived", "true");

    const [r, c, m] = await Promise.all([
      fetch(`/api/readings${params.toString() ? `?${params}` : ""}`).then(r => r.json()),
      fetch("/api/customers").then(r => r.json()),
      fetch("/api/meters").then(r => r.json()),
    ]);
    setReadings(r);
    setCustomers(c);
    setMeters(m);
    setSelected(new Set());
  }

  useEffect(() => { load(); }, [filterCustomer, filterMeter, showArchived]);

  const filteredMeters = filterCustomer
    ? meters.filter(m => m.customerId === filterCustomer)
    : meters;

  const formMeters = form.customerId
    ? meters.filter(m => m.customerId === form.customerId)
    : [];

  const selectedMeter = filterMeter ? meters.find(m => m.id === filterMeter) : null;

  async function pullFromMeter() {
    const meter = meters.find(m => m.id === form.meterId);
    if (!meter) { toast.error("Select a meter first"); return; }
    setPulling(true);
    try {
      const r = await fetch("/api/modbus/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: meter.meterIp, port: meter.meterPort, unitId: meter.meterUnitId, t1Register: meter.meterT1Register, t2Register: meter.meterT2Register }),
      });
      const result = await r.json();
      if (result.success) {
        setForm(f => ({ ...f, readingDate: nowForInput(), tariff1Kwh: String(result.tariff1Kwh), tariff2Kwh: String(result.tariff2Kwh), tariff3Kwh: result.tariff3Kwh !== undefined ? String(result.tariff3Kwh) : f.tariff3Kwh, tariff4Kwh: result.tariff4Kwh !== undefined ? String(result.tariff4Kwh) : f.tariff4Kwh, readMethod: "modbus" }));
        toast.success("Meter read successfully");
      } else {
        toast.error(`Modbus error: ${result.error}`);
      }
    } finally {
      setPulling(false);
    }
  }

  async function save() {
    if (!form.customerId || !form.tariff1Kwh) {
      toast.error("Fill in all required fields");
      return;
    }
    setLoading(true);
    try {
      await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: form.customerId,
          meterId: form.meterId || undefined,
          readingDate: form.readingDate,
          tariff1Kwh: parseFloat(form.tariff1Kwh),
          tariff2Kwh: form.tariff2Kwh !== "" ? parseFloat(form.tariff2Kwh) : 0,
          ...(form.tariff3Kwh !== "" && { tariff3Kwh: parseFloat(form.tariff3Kwh) }),
          ...(form.tariff4Kwh !== "" && { tariff4Kwh: parseFloat(form.tariff4Kwh) }),
          readMethod: form.readMethod,
          notes: form.notes,
        }),
      });
      toast.success("Reading saved");
      setShowForm(false);
      setForm({ customerId: "", meterId: "", readingDate: nowForInput(), tariff1Kwh: "", tariff2Kwh: "", tariff3Kwh: "", tariff4Kwh: "", readMethod: "manual", notes: "" });
      load();
    } finally {
      setLoading(false);
    }
  }

  function openEdit(r: MeterReading) {
    setEditReading(r);
    setEditForm({
      readingDate: format(new Date(r.readingDate), "yyyy-MM-dd'T'HH:mm"),
      tariff1Kwh: String(r.tariff1Kwh),
      tariff2Kwh: String(r.tariff2Kwh),
      tariff3Kwh: r.tariff3Kwh !== undefined ? String(r.tariff3Kwh) : "",
      tariff4Kwh: r.tariff4Kwh !== undefined ? String(r.tariff4Kwh) : "",
      readMethod: r.readMethod,
      notes: r.notes ?? "",
    });
  }

  async function saveEdit() {
    if (!editReading) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/readings/${editReading.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          readingDate: editForm.readingDate,
          tariff1Kwh: parseFloat(editForm.tariff1Kwh),
          tariff2Kwh: editForm.tariff2Kwh !== "" ? parseFloat(editForm.tariff2Kwh) : 0,
          ...(editForm.tariff3Kwh !== "" && { tariff3Kwh: parseFloat(editForm.tariff3Kwh) }),
          ...(editForm.tariff4Kwh !== "" && { tariff4Kwh: parseFloat(editForm.tariff4Kwh) }),
          readMethod: editForm.readMethod,
          notes: editForm.notes,
        }),
      });
      if (r.ok) {
        toast.success("Reading updated");
        setEditReading(null);
        load();
      } else {
        const e = await r.json();
        toast.error(e.error ?? "Failed to update");
      }
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this reading?")) return;
    const r = await fetch(`/api/readings/${id}`, { method: "DELETE" });
    if (r.ok) {
      toast.success("Reading deleted");
      load();
    } else {
      const e = await r.json();
      toast.error(e.error ?? "Failed to delete");
    }
  }

  async function exportCSV() {
    if (!selectedMeter) return;
    const r = await fetch(`/api/meters/${selectedMeter.id}/csv`);
    if (!r.ok) { toast.error("Export failed"); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meter-${selectedMeter.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }

  async function importCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedMeter) return;
    setImporting(true);
    try {
      const text = await file.text();
      const r = await fetch(`/api/meters/${selectedMeter.id}/csv`, {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: text,
      });
      const result = await r.json();
      if (r.ok) {
        toast.success(`Imported ${result.imported} new, updated ${result.updated}, skipped ${result.skipped}`);
        load();
      } else {
        toast.error(result.error ?? "Import failed");
      }
    } finally {
      setImporting(false);
      if (csvImportRef.current) csvImportRef.current.value = "";
    }
  }

  async function markBilledStatus(billed: boolean) {
    if (selected.size === 0) return;
    setMarkingBilled(true);
    try {
      const r = await fetch("/api/readings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], billedStatus: billed ? "billed" : "unbilled" }),
      });
      if (r.ok) {
        toast.success(billed ? `Marked ${selected.size} reading(s) as billed` : `Marked ${selected.size} reading(s) as unbilled`);
        load();
      } else {
        toast.error("Failed to update readings");
      }
    } finally {
      setMarkingBilled(false);
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} reading(s)? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const r = await fetch("/api/readings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (r.ok) {
        toast.success(`Deleted ${selected.size} reading(s)`);
        load();
      } else {
        const e = await r.json();
        toast.error(e.error ?? "Failed to delete readings");
      }
    } finally {
      setDeleting(false);
    }
  }

  async function archiveSelected(archive: boolean) {
    if (selected.size === 0) return;
    setArchiving(true);
    try {
      const r = await fetch("/api/readings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], archived: archive }),
      });
      if (r.ok) {
        toast.success(archive ? `Archived ${selected.size} reading(s)` : `Unarchived ${selected.size} reading(s)`);
        load();
      } else {
        toast.error("Failed to update readings");
      }
    } finally {
      setArchiving(false);
    }
  }

  const customerMap = Object.fromEntries(customers.map(c => [c.id, c]));
  const meterMap = Object.fromEntries(meters.map(m => [m.id, m]));

  const isBilled = (r: MeterReading) => !!r.billedInBillId && r.billedInBillId !== "unlinked";

  const displayedReadings = readings.filter((r) => {
    if (filterStatus === "billed" && !isBilled(r)) return false;
    if (filterStatus === "unbilled" && isBilled(r)) return false;
    if (filterDateFrom && r.readingDate.slice(0, 10) < filterDateFrom) return false;
    if (filterDateTo && r.readingDate.slice(0, 10) > filterDateTo) return false;
    return true;
  });

  const showT3Col = displayedReadings.some(r => r.tariff3Kwh !== undefined);
  const showT4Col = displayedReadings.some(r => r.tariff4Kwh !== undefined);

  return (
    <AppShell>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Meter Readings</h1>
            <p className="text-slate-500 text-sm mt-1">{displayedReadings.length}{displayedReadings.length !== readings.length ? ` of ${readings.length}` : ""} reading{readings.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Add Reading
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={filterCustomer}
            onChange={(e) => { setFilterCustomer(e.target.value); setFilterMeter(""); }}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Customers</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={filterMeter}
            onChange={(e) => setFilterMeter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Meters</option>
            {filteredMeters.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({customerMap[m.customerId]?.name ?? "?"})</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "" | "billed" | "unbilled")}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value="unbilled">Unbilled</option>
            <option value="billed">Billed</option>
          </select>

          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            title="From date"
            className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-slate-400 text-sm">–</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            title="To date"
            className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            onClick={() => setShowArchived(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2.5 border rounded-lg text-sm transition-colors ${showArchived ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {showArchived ? "Hide Archived" : "Show Archived"}
          </button>

          {/* CSV toolbar — shown when a specific meter is selected */}
          {selectedMeter && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" /> Export CSV
              </button>
              <button
                onClick={() => csvImportRef.current?.click()}
                disabled={importing}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Import CSV
              </button>
              <input ref={csvImportRef} type="file" accept=".csv" className="hidden" onChange={importCSV} />
            </div>
          )}
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg flex-wrap">
            <span className="text-sm text-blue-700 font-medium">{selected.size} selected</span>
            <button
              onClick={() => markBilledStatus(true)}
              disabled={markingBilled}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {markingBilled ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
              Mark Billed
            </button>
            <button
              onClick={() => markBilledStatus(false)}
              disabled={markingBilled}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Mark Unbilled
            </button>
            <button
              onClick={() => archiveSelected(!showArchived)}
              disabled={archiving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {archiving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
              {showArchived ? "Unarchive Selected" : "Archive Selected"}
            </button>
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

        {displayedReadings.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
            <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">{readings.length === 0 ? "No readings yet." : "No readings match the current filters."}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={displayedReadings.length > 0 && displayedReadings.every(r => selected.has(r.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelected(new Set(displayedReadings.map(r => r.id)));
                        else setSelected(new Set());
                      }}
                      className="rounded border-slate-300"
                    />
                  </th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Customer</th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Meter</th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Date / Time</th>
                  <th className="text-right px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">T1 (kWh)</th>
                  <th className="text-right px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">T2 (kWh)</th>
                  {showT3Col && <th className="text-right px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">T3 (kWh)</th>}
                  {showT4Col && <th className="text-right px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">T4 (kWh)</th>}
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Method</th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Status</th>
                  <th className="text-right px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayedReadings.map((r) => (
                  <tr key={r.id} className={`hover:bg-slate-50 transition-colors ${selected.has(r.id) ? "bg-blue-50" : ""}`}>
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(r.id); else next.delete(r.id);
                          setSelected(next);
                        }}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-900">{customerMap[r.customerId]?.name ?? "–"}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">
                      {r.meterId ? (
                        meterMap[r.meterId]
                          ? [meterMap[r.meterId].serialNumber, meterMap[r.meterId].name].filter(Boolean).join(" — ")
                          : <span className="italic">Unknown</span>
                      ) : <span className="italic text-slate-400">Unassigned</span>}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{format(new Date(r.readingDate), "dd/MM/yyyy HH:mm")}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-800">{r.tariff1Kwh.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-800">{r.tariff2Kwh.toFixed(2)}</td>
                    {showT3Col && <td className="px-5 py-3.5 text-right font-mono text-slate-800">{r.tariff3Kwh !== undefined ? r.tariff3Kwh.toFixed(2) : "–"}</td>}
                    {showT4Col && <td className="px-5 py-3.5 text-right font-mono text-slate-800">{r.tariff4Kwh !== undefined ? r.tariff4Kwh.toFixed(2) : "–"}</td>}
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${r.readMethod === "modbus" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                        {r.readMethod === "modbus" ? <Wifi className="w-3 h-3" /> : null}
                        {r.readMethod}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {r.archived ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">Archived</span>
                        ) : isBilled(r) ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Billed</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">Unbilled</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(r)}
                          disabled={isBilled(r)}
                          title={isBilled(r) ? "Remove bill first to edit" : "Edit reading"}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => remove(r.id)}
                          disabled={isBilled(r)}
                          title={isBilled(r) ? "Remove bill first to delete" : "Delete reading"}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Reading Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-900">Add Meter Reading</h2>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Customer <span className="text-red-500">*</span></label>
                  <select
                    value={form.customerId}
                    onChange={(e) => setForm({ ...form, customerId: e.target.value, meterId: "" })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select customer...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.accountNumber})</option>)}
                  </select>
                </div>

                {form.customerId && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Meter</label>
                    <select
                      value={form.meterId}
                      onChange={(e) => setForm({ ...form, meterId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No meter (unassigned)</option>
                      {formMeters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Reading Date &amp; Time <span className="text-red-500">*</span></label>
                  <input type="datetime-local" value={form.readingDate} onChange={(e) => setForm({ ...form, readingDate: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                {/* Pull from meter button */}
                {form.meterId && (
                  <button onClick={pullFromMeter} disabled={pulling} className="w-full flex items-center justify-center gap-2 py-2 border border-blue-300 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50">
                    {pulling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    {pulling ? "Reading meter..." : "Pull from Modbus Meter"}
                  </button>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Tariff 1 (kWh) <span className="text-red-500">*</span></label>
                    <input type="number" step="0.01" value={form.tariff1Kwh} onChange={(e) => setForm({ ...form, tariff1Kwh: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Tariff 2 (kWh) <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input type="number" step="0.01" value={form.tariff2Kwh} onChange={(e) => setForm({ ...form, tariff2Kwh: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Tariff 3 (kWh) <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input type="number" step="0.01" value={form.tariff3Kwh} onChange={(e) => setForm({ ...form, tariff3Kwh: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Tariff 4 (kWh) <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input type="number" step="0.01" value={form.tariff4Kwh} onChange={(e) => setForm({ ...form, tariff4Kwh: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Method</label>
                  <select value={form.readMethod} onChange={(e) => setForm({ ...form, readMethod: e.target.value as "manual" | "modbus" })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="manual">Manual</option>
                    <option value="modbus">Modbus</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
                  <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional notes..." />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button onClick={save} disabled={loading} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                  {loading ? "Saving..." : "Save Reading"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Reading Modal */}
        {editReading && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-900">Edit Reading</h2>
                <button onClick={() => setEditReading(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Reading Date &amp; Time</label>
                  <input type="datetime-local" value={editForm.readingDate} onChange={(e) => setEditForm({ ...editForm, readingDate: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Tariff 1 (kWh)</label>
                    <input type="number" step="0.01" value={editForm.tariff1Kwh} onChange={(e) => setEditForm({ ...editForm, tariff1Kwh: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Tariff 2 (kWh) <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input type="number" step="0.01" value={editForm.tariff2Kwh} onChange={(e) => setEditForm({ ...editForm, tariff2Kwh: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Tariff 3 (kWh) <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input type="number" step="0.01" value={editForm.tariff3Kwh} onChange={(e) => setEditForm({ ...editForm, tariff3Kwh: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Tariff 4 (kWh) <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input type="number" step="0.01" value={editForm.tariff4Kwh} onChange={(e) => setEditForm({ ...editForm, tariff4Kwh: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Method</label>
                  <select value={editForm.readMethod} onChange={(e) => setEditForm({ ...editForm, readMethod: e.target.value as "manual" | "modbus" })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="manual">Manual</option>
                    <option value="modbus">Modbus</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
                  <input type="text" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional notes..." />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                <button onClick={() => setEditReading(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button onClick={saveEdit} disabled={loading} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                  {loading ? "Saving..." : "Update Reading"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
