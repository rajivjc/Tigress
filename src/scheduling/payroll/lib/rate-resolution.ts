// =============================================================================
// Payroll — rate resolution (Session 27a)
// =============================================================================
// Pure function: given a base hourly rate, role, and shift window, compute
// the effective hourly rate and the map of multipliers that fired. No DB,
// no React, no side-effects.
//
// Composition rule:
//   effectiveRate = baseRate × prod(applicable multipliers)
// Multipliers compose multiplicatively. Rules are filtered by `is_active`
// then matched by `kind`:
//   * role         — match_value === shift role
//   * time_of_day  — shift's start_time falls within [window_start,
//                    window_end). Wrapping past midnight supported.
// When multiple time_of_day rules overlap, the one with the LOWEST
// `priority` value wins (priority = ordering). Ties broken by id (stable).
// =============================================================================

import type { PayrollRateRule } from "../types";

export interface RateResolutionInput {
  baseRate: number;
  role: string;
  shiftStartTime: string; // "HH:MM" or "HH:MM:SS"
  shiftEndTime: string;
  rules: PayrollRateRule[];
}

export interface RateResolutionResult {
  effectiveRate: number;
  multipliersApplied: Record<string, number>;
}

function timeToMinutes(t: string): number {
  const [h = "0", m = "0"] = t.split(":");
  return Number.parseInt(h, 10) * 60 + Number.parseInt(m, 10);
}

const MIN_PER_DAY = 24 * 60;

/**
 * True when `tMin` falls within [start, end), supporting wrap-past-midnight.
 * If end <= start the window is treated as wrapping (e.g. 22:00 → 02:00).
 */
function inTimeWindow(tMin: number, start: string, end: string): boolean {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (e > s) {
    return tMin >= s && tMin < e;
  }
  // Wrap: window covers [s, midnight) ∪ [0, e).
  return tMin >= s || tMin < e;
}

/**
 * Two-window overlap check supporting wrap-past-midnight on the rule side.
 * The shift window [shiftS, shiftE) is normalised. Returns true when ANY
 * minute of the shift falls within the rule window.
 */
function shiftOverlapsWindow(
  shiftS: number,
  shiftE: number,
  windowStart: string,
  windowEnd: string
): boolean {
  // Sample a granular set of minutes to detect overlap. We could close-form
  // it but multipliers' precision lives at minute granularity in practice.
  const span = Math.min(shiftE - shiftS, MIN_PER_DAY);
  if (span <= 0) return false;
  // Check every 15 mins + boundaries to keep the loop bounded.
  const step = 15;
  for (let t = shiftS; t < shiftS + span; t += step) {
    if (inTimeWindow(t % MIN_PER_DAY, windowStart, windowEnd)) return true;
  }
  // Also check the last minute of the shift to avoid missing tail-overlap.
  if (
    inTimeWindow((shiftS + span - 1) % MIN_PER_DAY, windowStart, windowEnd)
  ) {
    return true;
  }
  return false;
}

export function resolveRateForShift(
  input: RateResolutionInput
): RateResolutionResult {
  const { baseRate, role, shiftStartTime, shiftEndTime, rules } = input;

  const multipliersApplied: Record<string, number> = {};
  let effectiveRate = baseRate;

  // Filter active rules first.
  const active = rules.filter((r) => r.is_active);

  // Role multiplier (at most one — first match by priority asc).
  const roleRules = active
    .filter((r) => r.kind === "role" && r.match_value === role)
    .sort((a, b) =>
      a.priority !== b.priority ? a.priority - b.priority : a.id.localeCompare(b.id)
    );
  if (roleRules[0]) {
    const r = roleRules[0];
    multipliersApplied[`role:${r.match_value}`] = r.multiplier;
    effectiveRate *= r.multiplier;
  }

  // Time-of-day: collect all active TOD rules whose window overlaps the
  // shift window. Highest priority (lowest value) wins when multiple
  // overlap. Multiple distinct windows can stack if they don't overlap.
  // For simplicity: when a shift overlaps multiple TOD windows, the WINNING
  // rule for each minute is the lowest-priority rule covering that minute.
  // We approximate with: pick the lowest-priority rule whose window covers
  // any portion of the shift, and apply it once. Higher-priority overlapping
  // rules are skipped. Distinct non-overlapping rules each apply.
  const todActive = active
    .filter((r) => r.kind === "time_of_day" && r.window_start && r.window_end)
    .slice()
    .sort((a, b) =>
      a.priority !== b.priority
        ? a.priority - b.priority
        : a.id.localeCompare(b.id)
    );

  const shiftS = timeToMinutes(shiftStartTime);
  const shiftEraw = timeToMinutes(shiftEndTime);
  // Zero-length shift = no overlap with any window.
  const shiftE =
    shiftEraw === shiftS
      ? shiftS
      : shiftEraw < shiftS
      ? shiftEraw + MIN_PER_DAY
      : shiftEraw;

  const claimedMinutes: Array<{ start: number; end: number }> = [];
  for (const rule of todActive) {
    if (!rule.window_start || !rule.window_end) continue;
    if (!shiftOverlapsWindow(shiftS, shiftE, rule.window_start, rule.window_end)) {
      continue;
    }
    // Build the rule's window as 1 or 2 normalised intervals and intersect
    // with the shift. If any portion of the intersection is NOT already
    // claimed by a higher-priority rule, this rule applies.
    const ws = timeToMinutes(rule.window_start);
    const we = timeToMinutes(rule.window_end);
    const intervals: Array<{ start: number; end: number }> = [];
    if (we > ws) {
      intervals.push({ start: ws, end: we });
      intervals.push({ start: ws + MIN_PER_DAY, end: we + MIN_PER_DAY });
    } else {
      // Wrap.
      intervals.push({ start: ws, end: MIN_PER_DAY });
      intervals.push({ start: ws + MIN_PER_DAY, end: 2 * MIN_PER_DAY });
      intervals.push({ start: 0, end: we });
      intervals.push({ start: MIN_PER_DAY, end: MIN_PER_DAY + we });
    }

    let unclaimed = false;
    for (const iv of intervals) {
      const overlapStart = Math.max(iv.start, shiftS);
      const overlapEnd = Math.min(iv.end, shiftE);
      if (overlapEnd <= overlapStart) continue;
      // Subtract claimed regions.
      let cursor = overlapStart;
      const claimedSorted = claimedMinutes.slice().sort((a, b) => a.start - b.start);
      for (const c of claimedSorted) {
        if (c.end <= cursor) continue;
        if (c.start >= overlapEnd) break;
        if (c.start > cursor) {
          unclaimed = true;
          break;
        }
        cursor = Math.max(cursor, c.end);
      }
      if (cursor < overlapEnd) unclaimed = true;
      if (unclaimed) {
        claimedMinutes.push({ start: overlapStart, end: overlapEnd });
        break;
      }
    }

    if (unclaimed) {
      const key = `time_of_day:${rule.match_value}`;
      multipliersApplied[key] = rule.multiplier;
      effectiveRate *= rule.multiplier;
    }
  }

  return { effectiveRate, multipliersApplied };
}
