import { NextResponse } from "next/server";
import { readData } from "@/lib/db";

export async function GET() {
  const data = readData();

  const totalCustomers = data.customers.length;
  const totalBills = data.bills.length;
  const sentBills = data.bills.filter((b) => b.status === "sent").length;
  const paidBills = data.bills.filter((b) => b.status === "paid").length;
  const draftBills = data.bills.filter((b) => b.status === "draft").length;
  const totalRevenue = data.bills.filter((b) => b.status !== "draft").reduce((sum, b) => sum + b.total, 0);
  const totalReadings = data.meterReadings.length;
  const activeTariffs = data.tariffRates.filter((t) => !t.effectiveTo).length;

  // Recent bills
  const recentBills = data.bills
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, 5)
    .map((b) => {
      const customer = data.customers.find((c) => c.id === b.customerId);
      return { ...b, customerName: customer?.name ?? "Unknown" };
    });

  // Monthly revenue last 6 months
  const now = new Date();
  const monthlyRevenue = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
    const month = d.getMonth();
    const year = d.getFullYear();
    const revenue = data.bills
      .filter((b) => {
        const bd = new Date(b.generatedAt);
        return bd.getMonth() === month && bd.getFullYear() === year && b.status !== "draft";
      })
      .reduce((sum, b) => sum + b.total, 0);
    return { label, revenue };
  });

  return NextResponse.json({
    totalCustomers,
    totalBills,
    sentBills,
    paidBills,
    draftBills,
    totalRevenue,
    totalReadings,
    activeTariffs,
    recentBills,
    monthlyRevenue,
  });
}
