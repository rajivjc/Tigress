// =============================================================================
// Scheduling — availability check (Session 25)
// =============================================================================
// Pure function: given a target shift, the user's PT availability blocks for
// the week, the user's FT standing assignments, and the user's employment
// type, decide whether the user is available for the shift.
//
//   FT users: pass when they have an FT assignment that covers the shift's
//             (template_id, day_of_week) on this date. Otherwise fail —
//             FT staff don't submit weekly availability.
//
//   PT users: pass when the union of their availability blocks for the
//             same day_of_week fully covers [start_time, end_time).
// =============================================================================

import type { AvailabilityBlock, FtAssignment } from "../types";
import { dayOfWeekFor } from "./materialize";

export type EmploymentType = "full_time" | "part_time";

export interface AvailabilityCheckInput {
  user_employment_type: EmploymentType;
  shift: {
    shift_date: string;
    template_id: string;
    start_time: string;
    end_time: string;
  };
  availabilityBlocks: AvailabilityBlock[];
  ftAssignments: FtAssignment[];
}

export interface AvailabilityCheckResult {
  ok: boolean;
  reason?: string;
}

/** Convert "HH:MM" or "HH:MM:SS" to minutes-since-midnight. */
export function timeToMinutes(t: string): number {
  const [h = "0", m = "0"] = t.split(":");
  return Number.parseInt(h, 10) * 60 + Number.parseInt(m, 10);
}

export function isUserAvailableForShift(
  input: AvailabilityCheckInput
): AvailabilityCheckResult {
  const dow = dayOfWeekFor(input.shift.shift_date);

  if (input.user_employment_type === "full_time") {
    const match = input.ftAssignments.find(
      (fa) =>
        fa.template_id === input.shift.template_id &&
        fa.day_of_week === dow &&
        fa.effective_from <= input.shift.shift_date &&
        (fa.effective_until === null ||
          fa.effective_until >= input.shift.shift_date)
    );
    if (!match) {
      return {
        ok: false,
        reason: "No FT standing assignment covers this shift",
      };
    }
    return { ok: true };
  }

  // PT user — coverage by union of blocks for the same day_of_week.
  const shiftStart = timeToMinutes(input.shift.start_time);
  const shiftEnd = timeToMinutes(input.shift.end_time);
  if (shiftEnd <= shiftStart) {
    // Defensive — the data layer enforces this, but if a bad row sneaks
    // through we don't want to silently accept a zero-or-negative span.
    return { ok: false, reason: "Shift end must be after start" };
  }

  const blocks = input.availabilityBlocks
    .filter((b) => b.day_of_week === dow)
    .map((b) => ({
      start: timeToMinutes(b.start_time),
      end: timeToMinutes(b.end_time),
    }))
    .sort((a, b) => a.start - b.start);

  // Walk the blocks and merge any overlapping/adjacent ones, checking that
  // the merged union fully spans [shiftStart, shiftEnd).
  let cursor = shiftStart;
  for (const block of blocks) {
    if (block.start > cursor) break; // gap
    if (block.end > cursor) cursor = block.end;
    if (cursor >= shiftEnd) return { ok: true };
  }

  if (cursor >= shiftEnd) return { ok: true };
  return { ok: false, reason: "Availability does not cover the shift window" };
}

/**
 * Returns true when [aStart, aEnd) overlaps [bStart, bEnd). Used for
 * the same-day double-booking check at assignment time.
 */
export function timeRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const aS = timeToMinutes(aStart);
  const aE = timeToMinutes(aEnd);
  const bS = timeToMinutes(bStart);
  const bE = timeToMinutes(bEnd);
  return aS < bE && bS < aE;
}
