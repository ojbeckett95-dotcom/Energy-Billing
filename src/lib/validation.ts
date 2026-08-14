import { NextResponse } from "next/server";
import { z } from "zod";

/** Parses and validates a JSON request body, returning a 400 response on any problem. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join(".");
    return {
      ok: false,
      response: NextResponse.json(
        { error: field ? `${field}: ${issue.message}` : issue.message },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: result.data };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const isoDateTime = z.string().refine(v => !Number.isNaN(Date.parse(v)), "expected an ISO date");
const kwh = z.number().finite().min(0);
const money = z.number().finite().min(0);

export const idListSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "at least one id is required"),
});

export const generateBillSchema = z.object({
  customerId: z.string().min(1),
  meterId: z.string().min(1).optional(),
  tariffRateId: z.string().min(1),
  billingPeriodStart: isoDate,
  billingPeriodEnd: isoDate,
  openingReadingId: z.string().min(1),
  closingReadingId: z.string().min(1),
}).refine(b => b.billingPeriodStart <= b.billingPeriodEnd, {
  message: "billingPeriodEnd must not be before billingPeriodStart",
  path: ["billingPeriodEnd"],
});

export const readingSchema = z.object({
  customerId: z.string().min(1).optional(),
  meterId: z.string().min(1).optional(),
  readingDate: isoDateTime,
  tariff1Kwh: kwh,
  tariff2Kwh: kwh,
  tariff3Kwh: kwh.optional(),
  tariff4Kwh: kwh.optional(),
  readMethod: z.enum(["modbus", "manual"]),
  notes: z.string().max(2000).optional(),
});

export const readingsPatchSchema = idListSchema.extend({
  archived: z.boolean().optional(),
  billedStatus: z.enum(["billed", "unbilled"]).optional(),
}).refine(b => b.archived !== undefined || b.billedStatus !== undefined, {
  message: "archived or billedStatus is required",
});

const tariffFields = z.object({
  name: z.string().min(1),
  effectiveFrom: isoDate,
  effectiveTo: isoDate.optional(),
  tariff1RatePerKwh: money,
  tariff2Enabled: z.boolean(),
  tariff2RatePerKwh: money,
  tariff3Enabled: z.boolean().optional(),
  tariff3RatePerKwh: money.optional(),
  tariff4Enabled: z.boolean().optional(),
  tariff4RatePerKwh: money.optional(),
  tariff1Label: z.string().min(1),
  tariff2Label: z.string().min(1),
  tariff3Label: z.string().optional(),
  tariff4Label: z.string().optional(),
  standingChargePerDay: money,
  vatRate: z.number().finite().min(0).max(100),
  notes: z.string().max(2000).optional(),
});

const effectiveRangeIsOrdered = (t: { effectiveFrom?: string; effectiveTo?: string }) =>
  !t.effectiveFrom || !t.effectiveTo || t.effectiveFrom <= t.effectiveTo;
const effectiveRangeError = {
  message: "effectiveTo must not be before effectiveFrom",
  path: ["effectiveTo"],
};

export const tariffSchema = tariffFields.refine(effectiveRangeIsOrdered, effectiveRangeError);
export const tariffUpdateSchema = tariffFields.partial().refine(effectiveRangeIsOrdered, effectiveRangeError);

export const modbusReadSchema = z.object({
  meterId: z.string().min(1).optional(),
  ip: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  unitId: z.number().int().min(0).max(255).optional(),
  t1Register: z.number().int().min(0).max(65535).optional(),
  t2Register: z.number().int().min(0).max(65535).optional(),
  registerType: z.enum(["holding", "input"]).optional(),
  dataType: z.enum(["float32", "float64", "int16", "uint16", "int32", "uint32"]).optional(),
});
