// =============================================================================
// Timezone utilities — Asia/Singapore
// =============================================================================
// The venue runs in Singapore (UTC+8). Vercel and most CI runners are UTC, so
// raw `new Date()` and `.toISOString().slice(0, 10)` end up off-by-one for
// after-hours bookings. These helpers force all server-side date math through
// the venue's local time.
//
// Singapore has no DST, but we still go through Intl.DateTimeFormat so the
// helpers will Just Work if the venue ever moves elsewhere.
// =============================================================================

export const VENUE_TIMEZONE = "Asia/Singapore";

/** Singapore is a fixed UTC+8 — used as a fast path. */
const SGT_OFFSET_MINUTES = 8 * 60;

// ---------- Public helpers ----------

/** Returns the current calendar date (YYYY-MM-DD) in Singapore time. */
export function todaySGT(): string {
  return formatDateSGT(new Date());
}

/** Formats a Date as YYYY-MM-DD in Singapore time. */
export function formatDateSGT(date: Date): string {
  const parts = formatter.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/**
 * Returns a Date object representing the start (00:00) of the given
 * YYYY-MM-DD day in Singapore time.
 *
 * Implementation note: Singapore is a fixed UTC+8 with no DST, so we can
 * synthesise the moment by subtracting 8h from the equivalent UTC midnight.
 */
export function startOfDaySGT(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  // Date.UTC gives us the UTC instant for "y-m-d 00:00 UTC"; subtract the
  // SGT offset to get the actual instant of midnight in Singapore.
  const utcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - SGT_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
}

/**
 * Returns a Date for a specific hour on the given YYYY-MM-DD day in SGT.
 * Useful for slot generation (e.g. "10:00 on 2026-04-12 in Singapore").
 */
export function dateAtHourSGT(dateStr: string, hour: number): Date {
  const dayStart = startOfDaySGT(dateStr);
  return new Date(dayStart.getTime() + hour * 60 * 60 * 1000);
}

/**
 * Adds the given number of days to a YYYY-MM-DD date string, returning a new
 * YYYY-MM-DD string in SGT. Negative values go backwards.
 */
export function addDaysSGT(dateStr: string, days: number): string {
  const start = startOfDaySGT(dateStr);
  const next = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return formatDateSGT(next);
}

/** Returns the hour-of-day (0-23) for a Date, in Singapore time. */
export function hourOfDaySGT(date: Date): number {
  const parts = formatter.formatToParts(date);
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  return Number.parseInt(h, 10);
}

/**
 * Generic helper: formats an ISO timestamp as a YYYY-MM-DD calendar date in
 * the given IANA timezone. Falls back to the SGT fast-path when callers pass
 * `VENUE_TIMEZONE` so most call sites pay nothing for the abstraction. Used
 * by the payroll OT engine so per-venue timezone configuration threads
 * through into date math.
 */
export function dateInTimezone(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${iso}`);
  }
  if (timezone === VENUE_TIMEZONE) {
    return formatDateSGT(date);
  }
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/**
 * Returns the day-of-week (0=Sunday..6=Saturday) for an ISO timestamp in the
 * given timezone. We derive it by re-parsing the YYYY-MM-DD calendar date
 * (which is timezone-correct) as UTC and asking for `getUTCDay()`. Pure
 * arithmetic — no recursive timezone gymnastics.
 */
export function dayOfWeekInTimezone(iso: string, timezone: string): number {
  const ymd = dateInTimezone(iso, timezone);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ---------- Internals ----------

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: VENUE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});
