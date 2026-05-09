// =============================================================================
// Payroll — line-item aggregation (Session 27a)
// =============================================================================
// Pure function: given classified hours + per-staff resolved rates,
// produce one engine line item per (staff, classification kind) pair.
// Multiple shifts with the same kind aggregate into one summary line,
// preserving total hours and a representative applied rate.
//
// Statutory deduction line item is appended per staff when the settings'
// `statutory_deduction_pct > 0`.
// =============================================================================

import type {
  PayrollLineItem,
  PayrollLineItemKind,
  PayrollSettings,
} from "../types";
import type { ClassificationKind, ClassifiedHours } from "./overtime-classification";

export interface ResolvedRate {
  staffId: string;
  effectiveRate: number;
  multipliersApplied: Record<string, number>;
}

export interface BuildLineItemsInput {
  runId: string;
  classifiedHours: ClassifiedHours[];
  /**
   * Per-(staff, classification kind) resolved rate. The rate has any role +
   * time-of-day multipliers from `rate-resolution.ts` already baked in;
   * the OT multiplier from the classification is applied on top here.
   *
   * Key: `${staffId}::${classificationKind}` — this lets the engine pass
   * different rates per kind if it computes them (e.g. distinct multipliers
   * for daytime vs night). For the simple case the same effective rate
   * is used for all kinds; the helper `flatRate` below makes that easy.
   */
  resolvedRates: Map<string, ResolvedRate>;
  settings: PayrollSettings;
  /** Hourly rate fallback if resolvedRates has no entry for a staff. */
  baseRates: Map<string, number>;
}

/** Build a uniform resolvedRates map from a flat per-staff effective rate. */
export function flatResolvedRates(
  perStaffRate: Map<string, ResolvedRate>,
  kinds: ClassificationKind[]
): Map<string, ResolvedRate> {
  const out = new Map<string, ResolvedRate>();
  for (const [staffId, rr] of perStaffRate) {
    for (const k of kinds) {
      out.set(`${staffId}::${k}`, rr);
    }
  }
  return out;
}

const KIND_TO_LINE_ITEM_KIND: Record<ClassificationKind, PayrollLineItemKind> = {
  regular: "hours",
  daily_ot: "overtime",
  weekly_ot: "overtime",
  rest_day: "rest_day",
  public_holiday: "public_holiday",
};

const KIND_LABEL: Record<ClassificationKind, string> = {
  regular: "Regular hours",
  daily_ot: "Daily overtime",
  weekly_ot: "Weekly overtime",
  rest_day: "Rest day hours",
  public_holiday: "Public holiday hours",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type EngineLineItemDraft = Omit<
  PayrollLineItem,
  "id" | "created_at" | "updated_at"
>;

export function buildLineItems(
  input: BuildLineItemsInput
): EngineLineItemDraft[] {
  const { runId, classifiedHours, resolvedRates, settings, baseRates } = input;

  // Aggregate by (staff, classification kind).
  type Bucket = {
    staffId: string;
    kind: ClassificationKind;
    hours: number;
    amount: number;
    multipliers: Record<string, number> | null;
    rateApplied: number | null;
    sampleClockRecordId: string | null;
  };

  const buckets = new Map<string, Bucket>();

  for (const ch of classifiedHours) {
    const key = `${ch.staffId}::${ch.kind}`;
    const resolvedKey = `${ch.staffId}::${ch.kind}`;
    const rr = resolvedRates.get(resolvedKey);
    const base = baseRates.get(ch.staffId) ?? 0;
    const baseEffective = rr ? rr.effectiveRate : base;
    const effective = baseEffective * ch.multiplier;
    const amount = effective * ch.hours;

    const existing = buckets.get(key);
    if (existing) {
      existing.hours += ch.hours;
      existing.amount += amount;
    } else {
      const multipliers: Record<string, number> = rr
        ? { ...rr.multipliersApplied }
        : {};
      if (ch.multiplier !== 1.0) {
        multipliers[`ot:${ch.kind}`] = ch.multiplier;
      }
      buckets.set(key, {
        staffId: ch.staffId,
        kind: ch.kind,
        hours: ch.hours,
        amount,
        multipliers: Object.keys(multipliers).length > 0 ? multipliers : null,
        rateApplied: round2(effective),
        sampleClockRecordId: ch.recordId,
      });
    }
  }

  const items: EngineLineItemDraft[] = [];
  // Stable order: per-staff then kind for deterministic output.
  const sortedKeys = Array.from(buckets.keys()).sort();
  for (const key of sortedKeys) {
    const b = buckets.get(key)!;
    items.push({
      run_id: runId,
      staff_id: b.staffId,
      kind: KIND_TO_LINE_ITEM_KIND[b.kind],
      label: KIND_LABEL[b.kind],
      amount: round2(b.amount),
      hours: round2(b.hours),
      rate_applied: b.rateApplied,
      multipliers: b.multipliers,
      source: "engine",
      clock_record_id: b.sampleClockRecordId,
      notes: null,
    });
  }

  // Statutory deduction.
  const pct = settings.statutory_deduction_pct;
  if (pct > 0) {
    // Compute per-staff gross from items above and append a deduction.
    const gross = new Map<string, number>();
    for (const it of items) {
      gross.set(it.staff_id, (gross.get(it.staff_id) ?? 0) + it.amount);
    }
    for (const [staffId, g] of gross) {
      const ded = round2(-(g * pct) / 100);
      if (ded === 0) continue;
      items.push({
        run_id: runId,
        staff_id: staffId,
        kind: "statutory",
        label: `Statutory deduction (${pct}%)`,
        amount: ded,
        hours: null,
        rate_applied: null,
        multipliers: null,
        source: "engine",
        clock_record_id: null,
        notes: null,
      });
    }
  }

  return items;
}
