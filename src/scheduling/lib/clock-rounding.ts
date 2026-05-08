// =============================================================================
// Scheduling — clock rounding rules (Session 26)
// =============================================================================
// Pure function applied at lock time to translate a (scheduledStart,
// scheduledEnd, actualIn, actualOut) tuple into the (effectiveStart,
// effectiveEnd, durationMinutes) that gets persisted on the clock record
// once a manager locks the day.
//
// Rules:
//   * Clock-in within 5 minutes BEFORE scheduled start → snap to scheduled
//     start (5-minute grace).
//   * Clock-in <= scheduled start → also snap to scheduled start (the
//     employee was on time or early, scheduled is the truth).
//   * Clock-in > scheduled start → use the actual time (employee was late
//     and the venue does not pay for time not worked).
//   * Clock-out is always the actual time.
//   * Missing clocked_out_at → durationMinutes returned as null; the lock
//     workflow blocks on this in the action layer.
// =============================================================================

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

export interface ClockRoundingInput {
  scheduledStart: string; // ISO timestamp
  scheduledEnd: string;
  actualIn: string;
  actualOut: string | null;
}

export interface ClockRoundingResult {
  effectiveStart: string;
  effectiveEnd: string | null;
  durationMinutes: number | null;
}

export function applyRoundingRules(
  input: ClockRoundingInput
): ClockRoundingResult {
  const schedStartMs = Date.parse(input.scheduledStart);
  const schedEndMs = Date.parse(input.scheduledEnd);
  const actualInMs = Date.parse(input.actualIn);
  const actualOutMs =
    input.actualOut === null ? null : Date.parse(input.actualOut);

  if (Number.isNaN(schedStartMs) || Number.isNaN(actualInMs)) {
    throw new Error("Invalid timestamp passed to applyRoundingRules");
  }

  // Snap-to-scheduled inside the 5-minute grace window (exclusive lower
  // bound). Outside the window — either earlier-than-grace or later — use
  // the actual clock-in time.
  const insideGrace =
    actualInMs > schedStartMs - FIVE_MINUTES_MS && actualInMs <= schedStartMs;
  const effectiveStartMs = insideGrace ? schedStartMs : actualInMs;

  const effectiveStart = new Date(effectiveStartMs).toISOString();

  if (actualOutMs === null) {
    return {
      effectiveStart,
      effectiveEnd: null,
      durationMinutes: null,
    };
  }

  // Clock-out always uses actual. Defensive: if the clock-out comes before
  // the rounded start (e.g. an editing mistake), return zero duration rather
  // than a negative number — the manager UI will surface this as an
  // anomaly.
  const effectiveEndMs = actualOutMs;
  const effectiveEnd = new Date(effectiveEndMs).toISOString();
  const rawMinutes = Math.round(
    (effectiveEndMs - effectiveStartMs) / MS_PER_MINUTE
  );
  const durationMinutes = rawMinutes < 0 ? 0 : rawMinutes;
  // schedEnd is intentionally unused — the rounding rules clip start but
  // leave the end as actual. Reading it here keeps the lint quiet without
  // forcing an underscore prefix in the public input shape.
  void schedEndMs;

  return {
    effectiveStart,
    effectiveEnd,
    durationMinutes,
  };
}
