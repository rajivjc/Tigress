// =============================================================================
// Scheduling — derived attendance state (Session 26)
// =============================================================================
// Pure derivation function used by the manager clock-review UI to render a
// per-shift status pill. The "missing" state is computed (not stored): a
// shift that's >30 minutes past its scheduled start with no clock record
// AND no excused/no_show flag is "missing" — staff probably didn't show up
// and the manager should triage.
// =============================================================================

import type {
  ClockRecord,
  ShiftAttendance,
  ShiftAttendanceState,
} from "../types";

export const MISSING_THRESHOLD_MINUTES = 30;
const MS_PER_MINUTE = 60 * 1000;

interface DerivationInput {
  shift: {
    shift_date: string; // YYYY-MM-DD
    start_time: string; // HH:MM(:SS)
    end_time: string;
  };
  /** Current moment for "is the shift past its threshold?" arithmetic. */
  now: Date;
  clockRecord: ClockRecord | null;
  attendance: ShiftAttendance | null;
}

/**
 * Returns the UI-facing attendance state for a single shift.
 *
 * Priority:
 *   1. Manager-set excused/no_show flag wins.
 *   2. Active clock record  →  clocked_in
 *   3. Pending/locked clock record  →  completed
 *   4. No clock record yet, shift hasn't started or is within
 *      MISSING_THRESHOLD_MINUTES of scheduled start  →  expected
 *   5. No clock record, past threshold  →  missing
 */
export function getShiftAttendanceState(
  input: DerivationInput
): ShiftAttendanceState {
  if (input.attendance) {
    if (input.attendance.attendance_status === "excused") return "excused";
    if (input.attendance.attendance_status === "no_show") return "no_show";
  }

  if (input.clockRecord) {
    if (input.clockRecord.status === "active") return "clocked_in";
    return "completed";
  }

  const startMs = sgtTimestampMs(
    input.shift.shift_date,
    input.shift.start_time
  );
  const nowMs = input.now.getTime();
  if (nowMs - startMs > MISSING_THRESHOLD_MINUTES * MS_PER_MINUTE) {
    return "missing";
  }
  return "expected";
}

/**
 * Builds an absolute UTC instant for the given (YYYY-MM-DD, HH:MM(:SS))
 * tuple, treating the wall clock as Singapore time (UTC+8). The venue is
 * fixed at SGT and has no DST, so a constant offset is correct.
 */
function sgtTimestampMs(dateStr: string, timeStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [hh = "0", mm = "0", ss = "0"] = timeStr.split(":");
  const hours = Number.parseInt(hh, 10);
  const minutes = Number.parseInt(mm, 10);
  const seconds = Number.parseInt(ss, 10);
  const utc = Date.UTC(y, mo - 1, d, hours, minutes, seconds);
  return utc - 8 * 60 * 60 * 1000;
}
