// Background scheduler: auto meter readings + auto billing
// Run with: bun run scheduler.ts

import { readData, writeData, generateId, getActiveTariffId } from "./src/lib/db";
import { readMeterTCP } from "./src/lib/modbus";
import { buildBill, markReadingsBilled, resolveMeterBillingWindow } from "./src/lib/billing";
import { loadBillPDF, renderAndAttachBillPDF } from "./src/lib/bill-pdf";
import { formatCurrency } from "./src/lib/format";
import { sendBillEmail, sendBillEmailFailureNotification } from "./src/lib/email";
import type { MeterReading, Customer, SchedulerSettings } from "./src/lib/types";

const CHECK_INTERVAL_MS = 60_000; // check every minute

async function runAutoReadings() {
  const data = readData();
  if (!data.schedulerSettings.autoReadingsEnabled) return;

  const now = new Date();
  const lastRun = data.schedulerSettings.lastAutoReadAt
    ? new Date(data.schedulerSettings.lastAutoReadAt)
    : null;
  const intervalMs = data.schedulerSettings.autoReadingIntervalMinutes * 60_000;

  if (lastRun && now.getTime() - lastRun.getTime() < intervalMs) return;

  const meters = data.meters;
  console.log(`[scheduler] Auto-readings: polling ${meters.length} meter(s)...`);

  let ok = 0;
  for (const meter of meters) {
    if (!meter.customerId) {
      console.warn(`[scheduler]   skip ${meter.name}${meter.serialNumber ? ` (${meter.serialNumber})` : ""}: no customer assigned`);
      continue;
    }
    try {
      const result = await readMeterTCP(
        meter.meterIp,
        meter.meterPort || 502,
        meter.meterUnitId || 1,
        5000,
        meter.meterT1Register,
        meter.meterT2Register,
        meter.registerType,
        meter.dataType,
        meter.meterT3Register,
        meter.meterT4Register,
      );

      if (result.success && result.tariff1Kwh !== undefined && result.tariff2Kwh !== undefined) {
        const reading: MeterReading = {
          id: generateId(),
          customerId: meter.customerId,
          meterId: meter.id,
          readingDate: new Date().toISOString(),
          tariff1Kwh: result.tariff1Kwh,
          tariff2Kwh: result.tariff2Kwh,
          ...(result.tariff3Kwh !== undefined && { tariff3Kwh: result.tariff3Kwh }),
          ...(result.tariff4Kwh !== undefined && { tariff4Kwh: result.tariff4Kwh }),
          readMethod: "modbus",
        };
        const fresh = readData();
        fresh.meterReadings.push(reading);
        writeData(fresh);
        ok++;
        console.log(`[scheduler]   ✓ ${meter.name}: T1=${result.tariff1Kwh} T2=${result.tariff2Kwh} kWh`);
      } else {
        console.warn(`[scheduler]   ✗ ${meter.name}: ${result.error}`);
      }
    } catch (err) {
      console.error(`[scheduler]   error reading ${meter.name}:`, err);
    }
  }

  const updated = readData();
  updated.schedulerSettings.lastAutoReadAt = new Date().toISOString();
  writeData(updated);
  console.log(`[scheduler] Auto-readings done: ${ok}/${meters.length} succeeded`);
}

// Determine whether a customer should be auto-billed right now.
// Falls back to global SchedulerSettings when customer has no custom schedule.
function shouldBillCustomer(customer: Customer, settings: SchedulerSettings, today: Date, todayStr: string): boolean {
  if (customer.autoBillingEnabled === false) return false;

  const mode = customer.billingMode ?? settings.autoBillingMode ?? "day-of-month";
  const lastRun = customer.lastAutoBilledAt;

  if (mode === "weekly") {
    const dayOfWeek = customer.billingDayOfWeek ?? 1; // default Monday
    if (today.getDay() !== dayOfWeek) return false;
    if (lastRun) {
      const daysSince = (today.getTime() - new Date(lastRun).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 6) return false; // prevent double-billing on same week
    }
    return true;
  }

  if (mode === "interval-days") {
    const intervalDays = customer.billingIntervalDays ?? settings.autoBillingIntervalDays ?? 30;
    if (!lastRun) return true;
    const daysSinceLast = (today.getTime() - new Date(lastRun).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceLast >= intervalDays;
  }

  // day-of-month
  const billingDay = customer.billingDayOfMonth ?? settings.autoBillingDayOfMonth;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const effectiveBillingDay = Math.min(billingDay, daysInMonth);
  const billingDayThisMonth = new Date(today.getFullYear(), today.getMonth(), effectiveBillingDay);
  const billingDayStr = billingDayThisMonth.toISOString().substring(0, 10);
  return today >= billingDayThisMonth && (!lastRun || lastRun < billingDayStr);
}

async function runAutoBilling() {
  const data = readData();
  if (!data.schedulerSettings.autoBillingEnabled) return;

  const today = new Date();
  const todayStr = today.toISOString().substring(0, 10);

  // Gate on time-of-day: only run at or after the configured time.
  // If the scheduled time was missed (e.g. app was off), it runs as soon as possible after.
  const billingTime = data.schedulerSettings.autoBillingTimeOfDay ?? "00:00";
  const [billHour, billMin] = billingTime.split(":").map(Number);
  if (today.getHours() < billHour || (today.getHours() === billHour && today.getMinutes() < billMin)) {
    return; // Not yet time today
  }

  const { customers, tariffRates } = data;

  console.log(`[scheduler] Auto-billing: checking ${customers.length} customer(s)...`);
  let ok = 0;
  for (const customer of customers) {
    if (!shouldBillCustomer(customer, data.schedulerSettings, today, todayStr)) {
      continue; // not this customer's billing day
    }

    const customerMeters = data.meters.filter(m => m.customerId === customer.id);
    if (customerMeters.length === 0) {
      console.warn(`[scheduler]   skip ${customer.name}: no meters configured`);
      continue;
    }

    for (const meter of customerMeters) {
      try {
        const window = resolveMeterBillingWindow(meter.id, customer.id, data, todayStr);
        if ("error" in window) {
          console.warn(`[scheduler]   skip ${customer.name}/${meter.name}: ${window.error}`);
          continue;
        }
        const { openingReading, closingReading, billingPeriodStart, billingPeriodEnd } = window;
        if (window.standingChargeOnly) {
          console.log(`[scheduler]   note: ${customer.name}/${meter.name}: no new reading — billing standing charge only`);
        }

        const activeTariffId = getActiveTariffId(customer.id, billingPeriodStart, data);
        const tariff = activeTariffId ? tariffRates.find(t => t.id === activeTariffId) : undefined;

        if (!tariff) {
          console.warn(`[scheduler]   skip ${customer.name}/${meter.name}: no tariff plan assigned`);
          continue;
        }

        const bill = buildBill({
          customer, tariff, meter, openingReading, closingReading, billingPeriodStart, billingPeriodEnd,
        });

        await renderAndAttachBillPDF(
          bill, customer, tariff, data.branding, openingReading, closingReading, meter,
          data.schedulerSettings.pdfStoragePath, `${customer.name}/${meter.name}`,
        );

        // Save bill to disk immediately (before email attempt, so it's never lost)
        const fresh = readData();
        fresh.bills.push(bill);
        fresh.meterReadings = markReadingsBilled(
          fresh.meterReadings, bill, openingReading.readingDate, closingReading.readingDate,
        );
        const custIdx = fresh.customers.findIndex(c => c.id === customer.id);
        if (custIdx >= 0) {
          fresh.customers[custIdx] = { ...fresh.customers[custIdx], lastAutoBilledAt: todayStr };
        }
        writeData(fresh);
        ok++;

        // Send email (after saving — a hang or failure here won't lose the bill)
        const pdfBytes = loadBillPDF(bill);
        if (data.schedulerSettings.autoBillingSendEmail && customer.email && pdfBytes) {
          const emailResult = await sendBillEmail(
            bill, customer, data.branding, data.emailSettings, pdfBytes, meter,
          );
          const billUpdate = readData();
          const billIdx = billUpdate.bills.findIndex(b => b.id === bill.id);
          if (billIdx >= 0) {
            if (emailResult.success) {
              billUpdate.bills[billIdx] = { ...billUpdate.bills[billIdx], status: "sent", sentAt: new Date().toISOString() };
              console.log(`[scheduler]   ✓ ${customer.name}/${meter.name}: ${formatCurrency(bill.total)} — emailed`);
            } else {
              billUpdate.bills[billIdx] = { ...billUpdate.bills[billIdx], emailError: emailResult.error ?? "Unknown email error" };
              console.warn(`[scheduler]   ✓ ${customer.name}/${meter.name}: ${formatCurrency(bill.total)} — email failed: ${emailResult.error}`);
              await sendBillEmailFailureNotification(customer, bill, emailResult.error ?? "Unknown", data.emailSettings, data.branding);
            }
            writeData(billUpdate);
          }
        } else {
          console.log(`[scheduler]   ✓ ${customer.name}/${meter.name}: ${formatCurrency(bill.total)} — saved as draft`);
        }
      } catch (err) {
        console.error(`[scheduler]   error for ${customer.name}/${meter.name}:`, err);
      }
    }
  }

  // Update global lastAutoBillingAt for info only
  const updated = readData();
  updated.schedulerSettings.lastAutoBillingAt = todayStr;
  writeData(updated);
  console.log(`[scheduler] Auto-billing done: ${ok} bill(s) generated`);
}

function runAutoArchive() {
  const data = readData();
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const cutoff = threeMonthsAgo.toISOString();

  let count = 0;
  data.meterReadings = data.meterReadings.map((r) => {
    if (!r.archived && r.billedInBillId && r.readingDate < cutoff) {
      count++;
      return { ...r, archived: true };
    }
    return r;
  });

  if (count > 0) {
    writeData(data);
    console.log(`[scheduler] Auto-archived ${count} billed reading(s) older than 3 months`);
  }
}

async function tick() {
  try {
    await runAutoReadings();
    await runAutoBilling();
    runAutoArchive();
  } catch (err) {
    console.error("[scheduler] Unexpected error:", err);
  }
}

console.log("[scheduler] Started. Checking every minute.");
tick();
setInterval(tick, CHECK_INTERVAL_MS);
