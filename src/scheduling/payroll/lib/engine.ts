// =============================================================================
// Payroll — engine entry point (Session 27a)
// =============================================================================
// Composes the three pure libs (rate-resolution + overtime-classification +
// line-item-aggregation) into a single function that produces engine line
// items for a run from the data-layer inputs.
// =============================================================================

import "server-only";
import { listClockRecordsForUser } from "../../data/clock-records";
import { listAllStaff } from "@/lib/data/staff";
import { listRateRules } from "../data/rate-rules";
import { listAllRates, getRateOn } from "../data/rates";
import { getOvertimeRules } from "../data/overtime-rules";
import { listHolidaysInRange } from "../data/holidays";
import { getSettings } from "../data/settings";
import {
  buildLineItems,
  type EngineLineItemDraft,
  flatResolvedRates,
} from "./line-item-aggregation";
import {
  classifyHoursForPeriod,
  defaultRestDayResolver,
} from "./overtime-classification";
import { resolveRateForShift } from "./rate-resolution";
import type { ClockRecord } from "../../types";

export interface ComputeEngineItemsInput {
  runId: string;
  periodStart: string; // YYYY-MM-DD inclusive
  periodEnd: string; // YYYY-MM-DD inclusive
}

/**
 * Compute engine line items for the given run window. Pulls every locked
 * clock record whose clocked_in_at falls within [periodStart, periodEnd+1).
 */
export async function computeEngineItems(
  input: ComputeEngineItemsInput
): Promise<{ drafts: EngineLineItemDraft[]; clockRecords: ClockRecord[] }> {
  const [allStaff, otRules, settings, rateRules, allRates, holidays] =
    await Promise.all([
      listAllStaff(),
      getOvertimeRules(),
      getSettings(),
      listRateRules(),
      listAllRates(),
      listHolidaysInRange(input.periodStart, input.periodEnd),
    ]);

  if (!otRules || !settings) {
    return { drafts: [], clockRecords: [] };
  }

  // Period bounds (UTC ISO).
  const periodStartIso = `${input.periodStart}T00:00:00Z`;
  const periodEndExclusiveIso = nextDayIso(input.periodEnd);

  // Pull locked clock records for every staff in the period. We page per-staff
  // to keep the query small.
  const allRecords: ClockRecord[] = [];
  for (const staff of allStaff) {
    const recs = await listClockRecordsForUser(staff.id, 1000);
    for (const r of recs) {
      if (r.status !== "locked") continue;
      if (r.clocked_in_at < periodStartIso) continue;
      if (r.clocked_in_at >= periodEndExclusiveIso) continue;
      allRecords.push(r);
    }
  }

  // Classify.
  const classified = classifyHoursForPeriod({
    clockRecords: allRecords,
    overtimeRules: otRules,
    holidays,
    restDayResolver: defaultRestDayResolver(otRules),
  });

  // Resolve per-staff rate (uses period_start as the "as-of" date for now;
  // a richer model would resolve per-record).
  const baseRates = new Map<string, number>();
  const perStaffRR = new Map<
    string,
    { staffId: string; effectiveRate: number; multipliersApplied: Record<string, number> }
  >();
  for (const staff of allStaff) {
    const rate = await getRateOn(staff.id, input.periodStart);
    const baseRate = rate?.hourly_rate ?? 0;
    baseRates.set(staff.id, baseRate);
    // We don't yet have role/shift breakdown at engine entry — apply rate
    // multipliers by treating the role as the staff's most-recent qualification
    // is omitted; the engine simply passes through baseRate. Rate rules with
    // role=null don't apply, so for now resolved = base × 1.0 unless time-of-day
    // rules cover the entire 24h window which is unlikely.
    const resolved = resolveRateForShift({
      baseRate,
      role: "",
      shiftStartTime: "00:00",
      shiftEndTime: "00:00",
      rules: rateRules,
    });
    perStaffRR.set(staff.id, {
      staffId: staff.id,
      effectiveRate: resolved.effectiveRate,
      multipliersApplied: resolved.multipliersApplied,
    });
  }

  const resolvedRates = flatResolvedRates(perStaffRR, [
    "regular",
    "daily_ot",
    "weekly_ot",
    "rest_day",
    "public_holiday",
  ]);

  const drafts = buildLineItems({
    runId: input.runId,
    classifiedHours: classified,
    resolvedRates,
    settings,
    baseRates,
  });

  // Suppress unused variable warning — allRates is currently passed
  // through reconciliation snapshots only.
  void allRates;

  return { drafts, clockRecords: allRecords };
}

function nextDayIso(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString();
}
