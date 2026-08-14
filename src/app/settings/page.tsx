"use client";

import { useEffect, useState } from "react";
import { Settings, Wifi, Info, Clock, RefreshCw, CalendarDays, Mail, Save, FolderOpen, FolderSearch, Network, Archive, RotateCcw, ShieldCheck } from "lucide-react";
import AppShell from "@/components/AppShell";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/format-date";
import type { SchedulerSettings } from "@/lib/types";

const DEFAULT_SCHEDULER: SchedulerSettings = {
  autoReadingsEnabled: false,
  autoReadingIntervalMinutes: 60,
  autoBillingEnabled: false,
  autoBillingMode: "day-of-month",
  autoBillingDayOfMonth: 1,
  autoBillingIntervalDays: 30,
  autoBillingSendEmail: false,
  autoBillingTimeOfDay: "09:00",
  pdfStoragePath: "",
  serverPort: 3001,
  allowNetworkAccess: false,
  readingsArchiveMonths: 0,
};

export default function SystemSettingsPage() {
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("502");
  const [unitId, setUnitId] = useState("1");
  const [result, setResult] = useState<{ success: boolean; tariff1Kwh?: number; tariff2Kwh?: number; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const [scheduler, setScheduler] = useState<SchedulerSettings>(DEFAULT_SCHEDULER);
  const [savingScheduler, setSavingScheduler] = useState(false);
  const [browsingFolder, setBrowsingFolder] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveResult, setArchiveResult] = useState<{ archived: number; archiveFile: string } | null>(null);
  const [restarting, setRestarting] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newRecoveryPassword, setNewRecoveryPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    fetch("/api/scheduler-settings")
      .then(r => r.json())
      .then(s => setScheduler(prev => ({ ...prev, ...s })));
  }, []);

  async function testMeter() {
    if (!ip) { toast.error("Enter an IP address"); return; }
    setTesting(true);
    setResult(null);
    try {
      const r = await fetch("/api/modbus/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, port: parseInt(port) || 502, unitId: parseInt(unitId) || 1 }),
      });
      const data = await r.json();
      setResult(data);
      if (data.success) toast.success("Meter read successfully");
      else toast.error(`Failed: ${data.error}`);
    } finally {
      setTesting(false);
    }
  }

  async function saveScheduler() {
    setSavingScheduler(true);
    try {
      const r = await fetch("/api/scheduler-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scheduler),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        toast.error(body?.error ?? "Could not save settings");
        return;
      }
      setScheduler(prev => ({ ...prev, ...body }));
      toast.success("Settings saved");
    } catch {
      toast.error("Could not save settings");
    } finally {
      setSavingScheduler(false);
    }
  }

  async function browseFolder() {
    setBrowsingFolder(true);
    try {
      const current = encodeURIComponent(scheduler.pdfStoragePath ?? "");
      const r = await fetch(`/api/browse-folder?current=${current}`);
      const data = await r.json();
      if (data.path) {
        set("pdfStoragePath", data.path);
      } else if (data.error) {
        toast.error(`Folder picker error: ${data.error}`);
      }
    } catch {
      toast.error("Could not open folder picker");
    } finally {
      setBrowsingFolder(false);
    }
  }

  async function restartApp() {
    setRestarting(true);
    try {
      await fetch("/api/restart", { method: "POST" });
      toast.success("Restart signal sent — the app will restart in a few seconds");
    } catch {
      toast.error("Failed to send restart signal");
      setRestarting(false);
    }
    // Keep button disabled — page will reload when app comes back up
  }

  async function runArchive() {
    setArchiving(true);
    setArchiveResult(null);
    try {
      const r = await fetch("/api/readings/archive", { method: "POST" });
      const data = await r.json();
      if (!r.ok) { toast.error(data.error ?? "Archive failed"); return; }
      setArchiveResult(data);
      if (data.archived === 0) toast.success("No readings old enough to archive");
      else toast.success(`Archived ${data.archived} reading${data.archived !== 1 ? "s" : ""}`);
    } catch {
      toast.error("Archive request failed");
    } finally {
      setArchiving(false);
    }
  }

  async function changePassword() {
    if (!newPassword && !newRecoveryPassword) { toast.error("Enter a new password or a new recovery password"); return; }
    if (newPassword) {
      if (newPassword.length < 8) { toast.error("New password must be at least 8 characters"); return; }
      if (newPassword !== confirmPassword) { toast.error("New passwords do not match"); return; }
    }
    if (newRecoveryPassword && newRecoveryPassword.length < 8) {
      toast.error("Recovery password must be at least 8 characters"); return;
    }
    setChangingPassword(true);
    try {
      const r = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          ...(newPassword ? { newPassword } : {}),
          ...(newRecoveryPassword ? { newRecoveryPassword } : {}),
        }),
      });
      const data = await r.json();
      if (r.ok) {
        toast.success("Saved. Other signed-in sessions were signed out.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setNewRecoveryPassword("");
      } else {
        toast.error(data.error ?? "Failed to change password");
      }
    } catch {
      toast.error("Request failed");
    } finally {
      setChangingPassword(false);
    }
  }

  function set<K extends keyof SchedulerSettings>(key: K, value: SchedulerSettings[K]) {
    setScheduler(s => ({ ...s, [key]: value }));
  }

  return (
    <AppShell>
      <div className="p-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">System Settings</h1>
          <p className="text-slate-500 text-sm mt-1">Modbus meter testing, scheduler, and system information</p>
        </div>

        {/* Scheduler settings */}
        <div className="bg-white rounded-xl border border-slate-100 p-6 mb-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Scheduler Settings
            </h2>
            <button
              onClick={saveScheduler}
              disabled={savingScheduler}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {savingScheduler ? "Saving..." : "Save"}
            </button>
          </div>

          {/* Auto Readings */}
          <div className="mb-5">
            <label className="flex items-start gap-3 cursor-pointer mb-3">
              <div
                onClick={() => set("autoReadingsEnabled", !scheduler.autoReadingsEnabled)}
                className={`relative mt-0.5 w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${scheduler.autoReadingsEnabled ? "bg-blue-600" : "bg-slate-300"}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${scheduler.autoReadingsEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </div>
              <div>
                <span className="text-sm font-medium text-slate-800 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-blue-500" /> Automatic Meter Readings
                </span>
                <p className="text-xs text-slate-500 mt-0.5">Poll all customer meters on a schedule and save readings automatically</p>
              </div>
            </label>

            {scheduler.autoReadingsEnabled && (
              <div className="ml-14 mt-2">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Polling interval (minutes)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={scheduler.autoReadingIntervalMinutes}
                    onChange={(e) => set("autoReadingIntervalMinutes", parseInt(e.target.value) || 60)}
                    className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-500">minutes (min 5, max 1440)</span>
                </div>
                {scheduler.lastAutoReadAt && (
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    Last run: {formatDateTime(scheduler.lastAutoReadAt)}
                  </p>
                )}
                <p className="mt-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Note: Automatic polling requires a background scheduler process running alongside this app.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-5">
            <label className="flex items-start gap-3 cursor-pointer mb-3">
              <div
                onClick={() => set("autoBillingEnabled", !scheduler.autoBillingEnabled)}
                className={`relative mt-0.5 w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${scheduler.autoBillingEnabled ? "bg-blue-600" : "bg-slate-300"}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${scheduler.autoBillingEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </div>
              <div>
                <span className="text-sm font-medium text-slate-800 flex items-center gap-2">
                  <CalendarDays className="w-3.5 h-3.5 text-purple-500" /> Automatic Billing
                </span>
                <p className="text-xs text-slate-500 mt-0.5">Generate bills for all customers automatically on a schedule</p>
              </div>
            </label>

            {scheduler.autoBillingEnabled && (
              <div className="ml-14 mt-2 space-y-3">
                {/* Billing mode */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Billing schedule</label>
                  <div className="flex gap-3">
                    <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${(scheduler.autoBillingMode ?? "day-of-month") === "day-of-month" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                      <input
                        type="radio"
                        name="billingMode"
                        value="day-of-month"
                        checked={(scheduler.autoBillingMode ?? "day-of-month") === "day-of-month"}
                        onChange={() => set("autoBillingMode", "day-of-month")}
                        className="sr-only"
                      />
                      Day of month
                    </label>
                    <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${scheduler.autoBillingMode === "interval-days" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                      <input
                        type="radio"
                        name="billingMode"
                        value="interval-days"
                        checked={scheduler.autoBillingMode === "interval-days"}
                        onChange={() => set("autoBillingMode", "interval-days")}
                        className="sr-only"
                      />
                      Every X days
                    </label>
                  </div>
                </div>

                {/* Day-of-month config */}
                {(scheduler.autoBillingMode ?? "day-of-month") === "day-of-month" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Generate bills on day of month</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={scheduler.autoBillingDayOfMonth}
                        onChange={(e) => set("autoBillingDayOfMonth", parseInt(e.target.value) || 1)}
                        className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-500">of each month (1–28)</span>
                    </div>
                  </div>
                )}

                {/* Interval-days config */}
                {scheduler.autoBillingMode === "interval-days" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Generate bills every</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={scheduler.autoBillingIntervalDays ?? 30}
                        onChange={(e) => set("autoBillingIntervalDays", parseInt(e.target.value) || 30)}
                        className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-500">days since last billing run</span>
                    </div>
                  </div>
                )}

                {/* Time of day */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Generate bills at time</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      value={scheduler.autoBillingTimeOfDay ?? "09:00"}
                      onChange={(e) => set("autoBillingTimeOfDay", e.target.value || "09:00")}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                    <span className="text-xs text-slate-500">bills run at or after this time on the scheduled day</span>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <div
                    onClick={() => set("autoBillingSendEmail", !scheduler.autoBillingSendEmail)}
                    className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${scheduler.autoBillingSendEmail ? "bg-blue-600" : "bg-slate-300"}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${scheduler.autoBillingSendEmail ? "translate-x-4" : "translate-x-0.5"}`} />
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-slate-700">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    Email bills automatically after generating
                  </div>
                </label>

                {scheduler.lastAutoBillingAt && (
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    Last run: {formatDate(scheduler.lastAutoBillingAt)}
                  </p>
                )}
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Note: Auto-billing bills from the end of the last invoice period to the most recent reading, and requires a default tariff plan to be assigned per customer.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* PDF Storage */}
        <div className="bg-white rounded-xl border border-slate-100 p-6 mb-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <FolderOpen className="w-4 h-4" /> PDF Storage
            </h2>
            <button
              onClick={saveScheduler}
              disabled={savingScheduler}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {savingScheduler ? "Saving..." : "Save"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            When set, generated PDF bills are saved as files in the specified directory instead of being stored as base64 inside the data file. Leave blank to use the default inline storage.
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">PDF storage directory</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={scheduler.pdfStoragePath ?? ""}
                onChange={(e) => set("pdfStoragePath", e.target.value)}
                placeholder="e.g. C:\Bills\PDFs  or  /home/user/bills  or  data/pdfs"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <button
                onClick={browseFolder}
                disabled={browsingFolder}
                title="Browse for folder"
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-600 text-xs font-medium rounded-lg transition-colors flex-shrink-0"
              >
                {browsingFolder
                  ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  : <FolderSearch className="w-3.5 h-3.5" />}
                Browse…
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Click Browse to open a folder picker, or type a path directly. The directory will be created automatically if it does not exist.
            </p>
          </div>
          {scheduler.pdfStoragePath && (
            <div className="mt-3 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              New bills will be saved to: <code className="font-mono">{scheduler.pdfStoragePath}</code>
              <br />
              <span className="text-slate-500">Existing bills stored as base64 will continue to work. Use &quot;Regenerate PDF&quot; on a bill to move it to file storage.</span>
            </div>
          )}
        </div>

        {/* Network settings */}
        <div className="bg-white rounded-xl border border-slate-100 p-6 mb-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Network className="w-4 h-4" /> Network
            </h2>
            <button
              onClick={saveScheduler}
              disabled={savingScheduler}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {savingScheduler ? "Saving..." : "Save"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            By default the server only accepts connections from this machine (<code className="font-mono">127.0.0.1</code>).
            Enable network access to reach it from other devices on your network. A restart is required for either
            setting to take effect.
          </p>
          <label className="flex items-start gap-3 cursor-pointer mb-5">
            <div
              onClick={() => set("allowNetworkAccess", !scheduler.allowNetworkAccess)}
              className={`relative mt-0.5 w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${scheduler.allowNetworkAccess ? "bg-blue-600" : "bg-slate-300"}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${scheduler.allowNetworkAccess ? "translate-x-6" : "translate-x-1"}`} />
            </div>
            <div>
              <span className="text-sm font-medium text-slate-800">Allow access from other devices on the network</span>
              <p className="text-xs text-slate-500 mt-0.5">
                Others sign in at <code className="font-mono">http://&lt;this-server&gt;:{scheduler.serverPort ?? 3001}</code> with the same password.
                Traffic is unencrypted HTTP, so only enable this on a network you trust.
              </p>
            </div>
          </label>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Server port</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1024}
                max={65535}
                value={scheduler.serverPort ?? 3001}
                onChange={(e) => set("serverPort", parseInt(e.target.value) || 3001)}
                className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <span className="text-xs text-slate-500">default: 3001</span>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex-1">
                A restart is required for these changes to take effect.
              </p>
              <button
                onClick={restartApp}
                disabled={restarting}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
              >
                {restarting
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <RotateCcw className="w-3.5 h-3.5" />}
                {restarting ? "Restarting…" : "Restart Now"}
              </button>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="bg-white rounded-xl border border-slate-100 p-6 mb-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Archive className="w-4 h-4" /> Data Management
            </h2>
            <button
              onClick={saveScheduler}
              disabled={savingScheduler}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {savingScheduler ? "Saving..." : "Save"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Move readings older than a set number of months out of the main data file and into a separate
            archive file (<code className="font-mono">readings-archive.json</code>) in the same data directory.
            Archived readings are preserved and can be inspected manually — nothing is deleted.
          </p>
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Archive readings older than</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={120}
                value={scheduler.readingsArchiveMonths ?? 0}
                onChange={(e) => set("readingsArchiveMonths", parseInt(e.target.value) || 0)}
                className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-500">months (0 = disabled)</span>
            </div>
          </div>
          <button
            onClick={runArchive}
            disabled={archiving || (scheduler.readingsArchiveMonths ?? 0) <= 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {archiving
              ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Archive className="w-3.5 h-3.5" />}
            {archiving ? "Archiving…" : "Archive Now"}
          </button>
          {archiveResult && (
            <div className="mt-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              {archiveResult.archived === 0
                ? "No readings were old enough to archive."
                : <>{archiveResult.archived} reading{archiveResult.archived !== 1 ? "s" : ""} moved to <code className="font-mono">{archiveResult.archiveFile}</code></>}
            </div>
          )}
        </div>

        {/* Security / Change Password */}
        <div className="bg-white rounded-xl border border-slate-100 p-6 mb-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Security
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Change the login password or the recovery password for this application. Your current password (or
            recovery password) confirms the change. Other signed-in sessions are signed out.
          </p>
          <div className="space-y-3 max-w-sm">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Current or recovery password"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Repeat new password"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">New recovery password</label>
              <input
                type="password"
                value={newRecoveryPassword}
                onChange={e => setNewRecoveryPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Leave blank to keep the current one"
              />
            </div>
            <button
              onClick={changePassword}
              disabled={changingPassword || !currentPassword || (!newPassword && !newRecoveryPassword)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {changingPassword
                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <ShieldCheck className="w-3.5 h-3.5" />}
              {changingPassword ? "Saving…" : "Save Passwords"}
            </button>
          </div>
        </div>

        {/* Meter test */}
        <div className="bg-white rounded-xl border border-slate-100 p-6 mb-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Wifi className="w-4 h-4" /> Modbus Meter Test
          </h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="col-span-1">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">IP Address</label>
              <input value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.10" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Port</label>
              <input type="number" value={port} onChange={e => setPort(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Unit ID</label>
              <input type="number" value={unitId} onChange={e => setUnitId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <button onClick={testMeter} disabled={testing} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {testing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Wifi className="w-4 h-4" />}
            {testing ? "Connecting..." : "Test Meter Connection"}
          </button>

          {result && (
            <div className={`mt-4 p-4 rounded-lg border ${result.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              {result.success ? (
                <div className="text-sm text-green-800">
                  <p className="font-semibold mb-1">Connection successful!</p>
                  <p>Tariff 1: <strong>{result.tariff1Kwh} kWh</strong></p>
                  <p>Tariff 2: <strong>{result.tariff2Kwh} kWh</strong></p>
                </div>
              ) : (
                <p className="text-sm text-red-700"><strong>Error:</strong> {result.error}</p>
              )}
            </div>
          )}
        </div>

        {/* Register map info */}
        <div className="bg-white rounded-xl border border-slate-100 p-6 mb-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Info className="w-4 h-4" /> Default Modbus Register Map
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            Configured for common DIN-rail energy meters (e.g. Eastron SDM630, Carlo Gavazzi EM24).
            Override per-customer via the customer form (advanced section).
          </p>
          <table className="w-full text-xs text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 font-medium text-slate-600">Description</th>
                <th className="text-left py-2 font-medium text-slate-600">Register (decimal)</th>
                <th className="text-left py-2 font-medium text-slate-600">Env Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700">
              <tr><td className="py-2">Tariff 1 Import (kWh)</td><td className="py-2 font-mono">342</td><td className="py-2 font-mono text-blue-600">METER_T1_REGISTER</td></tr>
              <tr><td className="py-2">Tariff 2 Import (kWh)</td><td className="py-2 font-mono">344</td><td className="py-2 font-mono text-blue-600">METER_T2_REGISTER</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-slate-400 mt-3">Values are read as 32-bit IEEE 754 floats across two consecutive holding registers.</p>
        </div>

        {/* Data info */}
        <div className="bg-white rounded-xl border border-slate-100 p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4" /> Data Storage
          </h2>
          <p className="text-xs text-slate-500">
            All data is stored in <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-blue-700">data/app-data.json</code> in the project root.
            Back up this file regularly to preserve your data.
          </p>
          {scheduler.pdfStoragePath && (
            <p className="text-xs text-slate-500 mt-2">
              PDF bills are saved to: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-blue-700">{scheduler.pdfStoragePath}</code>
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
