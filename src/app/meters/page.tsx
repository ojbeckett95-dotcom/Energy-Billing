"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Server, Search, Wifi, RefreshCw, ChevronDown } from "lucide-react";
import AppShell from "@/components/AppShell";
import { toast } from "sonner";
import type { Meter, Customer, ModbusRegisterType, ModbusDataType } from "@/lib/types";

const EMPTY_FORM = {
  serialNumber: "",
  name: "",
  customerId: "",
  meterIp: "",
  meterPort: 502,
  meterUnitId: 1,
  meterT1Register: undefined as number | undefined,
  meterT2Register: undefined as number | undefined,
  registerType: "holding" as ModbusRegisterType,
  dataType: "float32" as ModbusDataType,
  notes: "",
};

export default function MetersPage() {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  async function load() {
    const [m, c] = await Promise.all([
      fetch("/api/meters").then(r => r.json()),
      fetch("/api/customers").then(r => r.json()),
    ]);
    setMeters(m);
    setCustomers(c);
  }

  useEffect(() => { load(); }, []);

  const customerMap = Object.fromEntries(customers.map(c => [c.id, c]));

  function openNew() {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setShowAdvanced(false);
    setShowForm(true);
  }

  function openEdit(m: Meter) {
    setEditId(m.id);
    setForm({
      serialNumber: m.serialNumber ?? "",
      name: m.name,
      customerId: m.customerId ?? "",
      meterIp: m.meterIp,
      meterPort: m.meterPort,
      meterUnitId: m.meterUnitId,
      meterT1Register: m.meterT1Register,
      meterT2Register: m.meterT2Register,
      registerType: m.registerType ?? "holding",
      dataType: m.dataType ?? "float32",
      notes: m.notes ?? "",
    });
    setShowAdvanced(!!(m.meterT1Register || m.meterT2Register || (m.registerType && m.registerType !== "holding") || (m.dataType && m.dataType !== "float32")));
    setShowForm(true);
  }

  async function save() {
    if (!form.serialNumber.trim() || !form.name.trim()) {
      toast.error("Serial number and name are required");
      return;
    }
    setLoading(true);
    try {
      const body = {
        serialNumber: form.serialNumber.trim(),
        name: form.name.trim(),
        customerId: form.customerId || null,
        meterIp: form.meterIp,
        meterPort: form.meterPort,
        meterUnitId: form.meterUnitId,
        ...(form.meterT1Register !== undefined && { meterT1Register: form.meterT1Register }),
        ...(form.meterT2Register !== undefined && { meterT2Register: form.meterT2Register }),
        registerType: form.registerType,
        dataType: form.dataType,
        notes: form.notes,
      };
      if (editId) {
        await fetch(`/api/meters/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Meter updated");
      } else {
        await fetch("/api/meters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Meter registered");
      }
      setShowForm(false);
      load();
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this meter? This will fail if readings are linked to it.")) return;
    const r = await fetch(`/api/meters/${id}`, { method: "DELETE" });
    if (r.ok) {
      toast.success("Meter deleted");
      load();
    } else {
      const e = await r.json();
      toast.error(e.error ?? "Failed to delete meter");
    }
  }

  async function testModbus(m: Meter) {
    if (!m.meterIp) { toast.error("No IP address configured"); return; }
    setTestingId(m.id);
    try {
      const r = await fetch("/api/modbus/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: m.meterIp,
          port: m.meterPort,
          unitId: m.meterUnitId,
          t1Register: m.meterT1Register,
          t2Register: m.meterT2Register,
          registerType: m.registerType,
          dataType: m.dataType,
        }),
      });
      const result = await r.json();
      if (result.success) {
        toast.success(`Connected! T1: ${result.tariff1Kwh} kWh | T2: ${result.tariff2Kwh} kWh`);
      } else {
        toast.error(`Failed: ${result.error}`);
      }
    } finally {
      setTestingId(null);
    }
  }

  const filtered = meters.filter(m =>
    !search ||
    (m.serialNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.customerId ? (customerMap[m.customerId]?.name ?? "").toLowerCase().includes(search.toLowerCase()) : false)
  );

  return (
    <AppShell>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Meters</h1>
            <p className="text-slate-500 text-sm mt-1">{meters.length} meter{meters.length !== 1 ? "s" : ""} registered</p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Register Meter
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by serial number, name or customer..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
            <Server className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">
              {meters.length === 0
                ? "No meters registered yet. Add a meter to get started."
                : "No meters match your search."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Serial #</th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Modbus</th>
                  <th className="text-left px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Customer</th>
                  <th className="text-right px-5 py-3.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((m) => {
                  const customer = m.customerId ? customerMap[m.customerId] : null;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4 font-mono text-sm font-semibold text-slate-800">
                        {m.serialNumber || <span className="text-slate-400 font-normal italic">—</span>}
                      </td>
                      <td className="px-5 py-4 text-slate-700">{m.name}</td>
                      <td className="px-5 py-4 text-slate-500 text-xs font-mono">
                        {m.meterIp ? `${m.meterIp}:${m.meterPort} · u${m.meterUnitId}` : <span className="italic text-slate-400">Not configured</span>}
                      </td>
                      <td className="px-5 py-4">
                        {customer ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            {customer.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 italic">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => testModbus(m)}
                            disabled={testingId === m.id || !m.meterIp}
                            title="Test Modbus connection"
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-40"
                          >
                            {testingId === m.id
                              ? <RefreshCw className="w-4 h-4 animate-spin" />
                              : <Wifi className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => openEdit(m)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => remove(m.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors"
                          >
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

        {/* Add / Edit Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-900">
                  {editId ? "Edit Meter" : "Register Meter"}
                </h2>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Serial Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.serialNumber}
                      onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                      placeholder="e.g. SN-1234567"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Meter Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Main Supply"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Assign to Customer <span className="text-slate-400">(optional)</span>
                  </label>
                  <select
                    value={form.customerId}
                    onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Unassigned —</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.accountNumber})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">IP Address</label>
                    <input
                      type="text"
                      value={form.meterIp}
                      onChange={(e) => setForm({ ...form, meterIp: e.target.value })}
                      placeholder="192.168.1.10"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Port</label>
                    <input
                      type="number"
                      value={form.meterPort}
                      onChange={(e) => setForm({ ...form, meterPort: parseInt(e.target.value) || 502 })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Unit ID</label>
                    <input
                      type="number"
                      value={form.meterUnitId}
                      onChange={(e) => setForm({ ...form, meterUnitId: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvanced(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                  Register overrides (advanced)
                </button>

                {showAdvanced && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                          Register Type
                        </label>
                        <select
                          value={form.registerType}
                          onChange={(e) => setForm({ ...form, registerType: e.target.value as ModbusRegisterType })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="holding">Holding (FC3)</option>
                          <option value="input">Input (FC4)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                          Data Type
                        </label>
                        <select
                          value={form.dataType}
                          onChange={(e) => setForm({ ...form, dataType: e.target.value as ModbusDataType })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="float32">Float32 (IEEE 754, 2 regs)</option>
                          <option value="float64">Float64 (IEEE 754, 4 regs)</option>
                          <option value="int16">INT16 (1 reg, signed)</option>
                          <option value="uint16">UINT16 (1 reg, unsigned)</option>
                          <option value="int32">INT32 / DINT (2 regs, signed)</option>
                          <option value="uint32">UINT32 / UDINT (2 regs, unsigned)</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                          T1 Register <span className="text-slate-400">(default 342)</span>
                        </label>
                        <input
                          type="number"
                          value={form.meterT1Register ?? ""}
                          onChange={(e) => setForm({ ...form, meterT1Register: e.target.value ? parseInt(e.target.value) : undefined })}
                          placeholder="342"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                          T2 Register <span className="text-slate-400">(default 344)</span>
                        </label>
                        <input
                          type="number"
                          value={form.meterT2Register ?? ""}
                          onChange={(e) => setForm({ ...form, meterT2Register: e.target.value ? parseInt(e.target.value) : undefined })}
                          placeholder="344"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Optional notes..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={loading || !form.serialNumber.trim() || !form.name.trim()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {loading ? "Saving..." : editId ? "Update Meter" : "Register Meter"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
