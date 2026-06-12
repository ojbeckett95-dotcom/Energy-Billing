"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Users, FileText, Zap, Activity, TrendingUp, Clock, CheckCircle, Send } from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { format } from "date-fns";

interface DashboardData {
  totalCustomers: number;
  totalBills: number;
  sentBills: number;
  paidBills: number;
  draftBills: number;
  totalRevenue: number;
  totalReadings: number;
  activeTariffs: number;
  recentBills: Array<{
    id: string;
    customerName: string;
    total: number;
    status: string;
    generatedAt: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
  }>;
  monthlyRevenue: Array<{ label: string; revenue: number }>;
}

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-pulse text-slate-400">Loading dashboard...</div>
        </div>
      </AppShell>
    );
  }

  const stats = [
    { label: "Customers", value: data.totalCustomers, icon: Users, color: "text-blue-600", bg: "bg-blue-50", href: "/customers" },
    { label: "Bills Generated", value: data.totalBills, icon: FileText, color: "text-purple-600", bg: "bg-purple-50", href: "/bills" },
    { label: "Meter Readings", value: data.totalReadings, icon: Activity, color: "text-amber-600", bg: "bg-amber-50", href: "/readings" },
    { label: "Active Tariffs", value: data.activeTariffs, icon: Zap, color: "text-green-600", bg: "bg-green-50", href: "/tariffs" },
  ];

  return (
    <AppShell>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Energy billing overview</p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="block">
              <div className="bg-white rounded-xl p-5 border border-slate-100 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">{s.label}</span>
                  <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center`}>
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                </div>
                <div className="text-3xl font-bold text-slate-900">{s.value}</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Revenue chart */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Monthly Revenue</h2>
                <p className="text-xs text-slate-500">Last 6 months</p>
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold text-slate-700">
                  £{data.totalRevenue.toFixed(2)}
                </span>
                <span className="text-xs text-slate-400">total</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.monthlyRevenue} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `£${v}`} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [`£${v.toFixed(2)}`, "Revenue"]} cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Bill status breakdown */}
          <div className="bg-white rounded-xl border border-slate-100 p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-5">Bill Status</h2>
            <div className="space-y-4">
              {[
                { label: "Draft", value: data.draftBills, icon: Clock, color: "text-slate-500", barColor: "bg-slate-300" },
                { label: "Sent", value: data.sentBills, icon: Send, color: "text-blue-500", barColor: "bg-blue-400" },
                { label: "Paid", value: data.paidBills, icon: CheckCircle, color: "text-green-500", barColor: "bg-green-400" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                      <span className="text-sm text-slate-600">{s.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{s.value}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full">
                    <div
                      className={`h-1.5 rounded-full ${s.barColor} transition-all`}
                      style={{ width: data.totalBills ? `${(s.value / data.totalBills) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-5 border-t border-slate-100">
              <Link href="/bills/new" className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors">
                <FileText className="w-4 h-4" />
                Generate New Bill
              </Link>
            </div>
          </div>
        </div>

        {/* Recent bills */}
        <div className="bg-white rounded-xl border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-slate-900">Recent Bills</h2>
            <Link href="/bills" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              View all
            </Link>
          </div>
          {data.recentBills.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              No bills yet. <Link href="/bills/new" className="text-blue-600 hover:underline">Generate your first bill</Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left pb-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Customer</th>
                  <th className="text-left pb-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Period</th>
                  <th className="text-left pb-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Generated</th>
                  <th className="text-left pb-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                  <th className="text-right pb-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.recentBills.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 font-medium text-slate-900">{b.customerName}</td>
                    <td className="py-3 text-slate-600">
                      {format(new Date(b.billingPeriodStart), "dd/MM/yy")} – {format(new Date(b.billingPeriodEnd), "dd/MM/yy")}
                    </td>
                    <td className="py-3 text-slate-500">{format(new Date(b.generatedAt), "dd/MM/yyyy")}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[b.status]}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3 text-right font-semibold text-slate-900">£{b.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
