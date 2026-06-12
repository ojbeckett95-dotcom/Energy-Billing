"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Eye, EyeOff, Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/status")
      .then(r => r.json())
      .then(d => {
        if (d.authenticated) { router.replace("/"); return; }
        setHasPassword(d.hasPassword);
      });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!hasPassword) {
      // First-run setup
      if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
      if (password !== confirmPassword) { setError("Passwords do not match"); return; }
      setLoading(true);
      const r = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      setLoading(false);
      if (!r.ok) { setError(d.error ?? "Setup failed"); return; }
      router.replace("/");
    } else {
      // Normal login
      setLoading(true);
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      setLoading(false);
      if (!r.ok) { setError(d.error ?? "Login failed"); return; }
      router.replace("/");
    }
  }

  if (hasPassword === null) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-white text-xl font-bold">Energy Billing</h1>
          <p className="text-slate-400 text-sm mt-1">
            {hasPassword ? "Sign in to continue" : "Create a password to secure your system"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {!hasPassword && (
            <div className="mb-5 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              This is your first time logging in. Set a password to protect your billing data.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                {hasPassword ? "Password" : "New Password"}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoFocus
                  required
                  placeholder={hasPassword ? "Enter your password" : "At least 6 characters"}
                  className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {!hasPassword && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirm Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Repeat password"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Lock className="w-4 h-4" />}
              {loading ? (hasPassword ? "Signing in…" : "Setting up…") : (hasPassword ? "Sign In" : "Set Password & Continue")}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-5">
          Forgot your password? Use the recovery password documented in your setup notes.
        </p>
      </div>
    </div>
  );
}
