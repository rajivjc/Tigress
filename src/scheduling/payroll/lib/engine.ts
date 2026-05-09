// =============================================================================
// Payroll — engine entry point (Session 27a)
// =============================================================================
// Composes the three pure libs (rate-resolution + overtime-classification +
// line-item-aggregation) into a single function that produces engine line
// items for a run from the data-layer inputs.
//
// S27a-fix-2 Finding 1 — the engine now resolves the rate ONCE PER CLOCK
// RECORD using the underlying schedule_shifts row's role + start_time +
// end_time. Previously this used an empty-shift placeholder, which meant
// rate rules never matched (role and time-of-day multipliers shipped
// inert). Per-record resolution is what makes the rule engine honest.
// =============================================================================

import "server-only";
import {
  listClockRecordsInPeriod,
} from "../../data/clock-records";
import { getShiftsByIds } from "../../data/weeks";
import { listRateRules } from "../data/rate-rules";
import { listAllRates, getRateOn } from "../data/rates";
import { getOvertimeRules } from "../data/overtime-rules";
import { listHolidaysInRange } from "../data/holidays";
import { getSettings } from "../data/settings";
import {
  buildLineItemsPerRecord,
  type EngineLineItemDraft,
  type ResolvedRate,
} from "./line-item-aggregation";
import {
  classifyHoursForPeriod,
  defaultRestDayResolver,
} from "./overtime-classification";
import { resolveRateForShift } from "./rate-resolution";
import { dateInTimezone } from "@/lib/timezone";
import type { ClockRecord } from "../../types";
import type { ScheduleShift } from "../../types";

export interface ComputeEngineItemsInput {
  runId: string;
  periodStart: string; // YYYY-MM-DD inclusive
  periodEnd: string; // YYYY-MM-DD inclusive
}

/**
 * Compute engine line items for the given run window. Pulls every locked
 * clock record whose clocked_in_at falls within [periodStart, periodEnd+1)
 * via a single query, batches the parent-shift fetch, then resolves a per-
 * record rate using the shift's role + start/end window.
 */
export async function computeEngineItems(
  input: ComputeEngineItemsInput
): Promise<{ drafts: EngineLineItemDraft[]; clockRecords: ClockRecord[] }> {
  const [otRules, settings, rateRules, allRates, holidays] = await Promise.all([
    getOvertimeRules(),
    getSettings(),
    listRateRules(),
    listAllRates(),
    listHolidaysInRange(input.periodStart, input.periodEnd),
  ]);

  if (!otRules || !settings) {
    return { drafts: [], clockRecords: [] };
  }

  const timezone = settings.timezone ?? "Asia/Singapore";

  // Period bounds (UTC ISO).
  const periodStartIso = `${input.periodStart}T00:00:00Z`;
  const periodEndExclusiveIso = nextDayIso(input.periodEnd);

  // 1. Pull every locked clock record in one query.
  const allRecords = await listClockRecordsInPeriod(
    periodStartIso,
    periodEndExclusiveIso
  );

  // 2. Batched shift fetch — every record's parent in one round trip.
  const distinctShiftIds = Array.from(
    new Set(allRecords.map((r) => r.shift_id))
  );
  const shifts = await getShiftsByIds(distinctShiftIds);
  const shiftById = new Map<string, ScheduleShift>(
    shifts.map((s) => [s.id, s])
  );

  // 3. Per-record rate resolution. Orphan records (no parent shift) are
  //    SKIPPED with a warning rather than failed — a failed engine run
  //    blocks payroll, while a skipped record produces visibly-incorrect
  //    totals that the manager can investigate. Bias to non-blocking
  //    recovery.
  const baseRates = new Map<string, number>();
  const perRecordResolved = new Map<string, ResolvedRate>();
  const usableRecords: ClockRecord[] = [];

  for (const record of allRecords) {
    const shift = shiftById.get(record.shift_id);
    if (!shift) {
      console.warn(
        `[payroll engine] orphan clock record ${record.id} skipped (parent shift ${record.shift_id} missing)`
      );
      continue;
    }
    const recordDate = dateInTimezone(record.clocked_in_at, timezone);
    let baseRate = baseRates.get(record.user_id);
    if (baseRate === undefined) {
      const rate = await getRateOn(record.user_id, recordDate);
      baseRate = rate?.hourly_rate ?? 0;
      baseRates.set(record.user_id, baseRate);
    }
    const resolved = resolveRateForShift({
      baseRate,
      role: shift.role,
      shiftStartTime: shift.start_time,
      shiftEndTime: shift.end_time,
      rules: rateRules,
    });
    perRecordResolved.set(record.id, {
      staffId: record.user_id,
      effectiveRate: resolved.effectiveRate,
      multipliersApplied: resolved.multipliersApplied,
    });
    usableRecords.push(record);
  }

  // 4. Classify hours via the OT engine (timezone-aware).
  const classified = classifyHoursForPeriod({
    clockRecords: usableRecords,
    overtimeRules: otRules,
    holidays,
    restDayResolver: defaultRestDayResolver(otRules, timezone),
    timezone,
  });

  // 5. Build line items per-record so different rates within the same
  //    (staff, kind) split into separate lines.
  const drafts = buildLineItemsPerRecord({
    runId: input.runId,
    classifiedHours: classified,
    perRecordResolved,
    settings,
    baseRates,
  });

  // allRates is currently passed through reconciliation snapshots only.
  void allRates;

  return { drafts, clockRecords: usableRecords };
}

function nextDayIso(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString();
}
