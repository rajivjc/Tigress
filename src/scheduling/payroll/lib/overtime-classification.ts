// =============================================================================
// Payroll — overtime classification (Session 27a)
// =============================================================================
// Pure function: given the locked clock records for a pay period and the
// venue's overtime rules + holiday calendar, classify each record's hours
// into one or more buckets.
//
// Application order (highest precedence first):
//   public_holiday > rest_day > daily_ot > weekly_ot > regular
//
// Each clock-record-hour ends up in exactly one bucket. Weekly thresholds
// are computed against the running per-staff total within the period,
// using ISO Monday-anchored weeks. Daily thresholds against the per-staff
// per-date total. Both thresholds are optional (NULL = disabled).
// =============================================================================

import type { ClockRecord } from "../../types";
import type { PayrollHoliday, PayrollOvertimeRules } from "../types";

export type ClassificationKind =
  | "regular"
  | "daily_ot"
  | "weekly_ot"
  | "rest_day"
  | "public_holiday";

export interface ClassifiedHours {
  recordId: string;
  staffId: string;
  date: string;
  kind: ClassificationKind;
  hours: number;
  multiplier: number;
}

export interface RestDayResolver {
  /** Returns true when the given (staffId, ISODate) is a rest day. */
  (staffId: string, isoDate: string): boolean;
}

export interface OvertimeClassificationInput {
  clockRecords: ClockRecord[];
  overtimeRules: PayrollOvertimeRules;
  holidays: PayrollHoliday[];
  restDayResolver: RestDayResolver;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function hoursBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, (end - start) / MS_PER_HOUR);
}

/** Returns the ISO Monday of the week containing `iso`. UTC math. */
function isoWeekStart(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const sundayBased = date.getUTCDay();
  const mondayBased = (sundayBased + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  date.setUTCDate(date.getUTCDate() - mondayBased);
  return date.toISOString().slice(0, 10);
}

export function defaultRestDayResolver(
  rules: PayrollOvertimeRules
): RestDayResolver {
  if (rules.rest_day_strategy === "sunday") {
    return (_staffId, isoDate) => {
      const [y, m, d] = isoDate.split("-").map(Number);
      const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      return day === 0;
    };
  }
  // configured_per_staff and none both default to "no rest day inferred";
  // configured_per_staff is for a future enhancement.
  return () => false;
}

export function classifyHoursForPeriod(
  input: OvertimeClassificationInput
): ClassifiedHours[] {
  const { clockRecords, overtimeRules, holidays, restDayResolver } = input;

  const holidayDates = new Set(
    holidays.filter((h) => h.is_active).map((h) => h.date)
  );

  const dailyThreshold = overtimeRules.daily_threshold_hours;
  const weeklyThreshold = overtimeRules.weekly_threshold_hours;

  // Build per-record duration + date.
  type Record = {
    record: ClockRecord;
    date: string;
    weekStart: string;
    duration: number;
  };
  const enriched: Record[] = clockRecords
    .filter((r) => r.clocked_out_at !== null)
    .map((r) => ({
      record: r,
      date: dateOnly(r.clocked_in_at),
      weekStart: isoWeekStart(r.clocked_in_at),
      duration: hoursBetween(r.clocked_in_at, r.clocked_out_at!),
    }))
    // Sort chronologically so daily/weekly running totals are deterministic.
    .sort((a, b) => a.record.clocked_in_at.localeCompare(b.record.clocked_in_at));

  const out: ClassifiedHours[] = [];

  // Per-staff running totals.
  const dailyTotal = new Map<string, number>(); // key: staff::date
  const weeklyTotal = new Map<string, number>(); // key: staff::weekStart

  for (const e of enriched) {
    const staffId = e.record.user_id;
    let remaining = e.duration;
    if (remaining <= 0) continue;

    const isPH = holidayDates.has(e.date);
    const isRD = restDayResolver(staffId, e.date);

    // PH wins; entire record's hours classified as public_holiday.
    if (isPH) {
      out.push({
        recordId: e.record.id,
        staffId,
        date: e.date,
        kind: "public_holiday",
        hours: remaining,
        multiplier: overtimeRules.public_holiday_multiplier,
      });
      // PH hours don't count toward daily/weekly OT thresholds.
      remaining = 0;
      continue;
    }

    // Rest day next.
    if (isRD) {
      out.push({
        recordId: e.record.id,
        staffId,
        date: e.date,
        kind: "rest_day",
        hours: remaining,
        multiplier: overtimeRules.rest_day_multiplier,
      });
      remaining = 0;
      continue;
    }

    // Bucket into daily_ot, weekly_ot, regular.
    const dailyKey = `${staffId}::${e.date}`;
    const weeklyKey = `${staffId}::${e.weekStart}`;
    const dailyAlready = dailyTotal.get(dailyKey) ?? 0;
    const weeklyAlready = weeklyTotal.get(weeklyKey) ?? 0;

    // Walk hours through the buckets.
    let regularTaken = 0;
    let dailyOtTaken = 0;
    let weeklyOtTaken = 0;

    while (remaining > 0) {
      const dailyRoom =
        dailyThreshold !== null && dailyThreshold !== undefined
          ? Math.max(0, dailyThreshold - (dailyAlready + regularTaken))
          : Number.POSITIVE_INFINITY;
      const weeklyRoom =
        weeklyThreshold !== null && weeklyThreshold !== undefined
          ? Math.max(
              0,
              weeklyThreshold -
                (weeklyAlready + regularTaken + dailyOtTaken + weeklyOtTaken)
            )
          : Number.POSITIVE_INFINITY;

      // Within both daily and weekly limits → regular.
      if (dailyRoom > 0 && weeklyRoom > 0) {
        const take = Math.min(remaining, dailyRoom, weeklyRoom);
        regularTaken += take;
        remaining -= take;
        continue;
      }

      // If daily is over but weekly still has room → daily_ot.
      if (
        dailyRoom <= 0 &&
        weeklyRoom > 0 &&
        dailyThreshold !== null &&
        dailyThreshold !== undefined
      ) {
        const take = Math.min(remaining, weeklyRoom);
        dailyOtTaken += take;
        remaining -= take;
        continue;
      }

      // Weekly is over → weekly_ot. (Daily threshold may be disabled or
      // also over — either way the precedence puts these into weekly_ot.)
      weeklyOtTaken += remaining;
      remaining = 0;
    }

    // Update running tallies — daily counts ALL hours toward the daily
    // threshold (regular + ot), since the threshold is "hours worked
    // today before OT kicks in".
    dailyTotal.set(
      dailyKey,
      dailyAlready + regularTaken + dailyOtTaken + weeklyOtTaken
    );
    weeklyTotal.set(
      weeklyKey,
      weeklyAlready + regularTaken + dailyOtTaken + weeklyOtTaken
    );

    if (regularTaken > 0) {
      out.push({
        recordId: e.record.id,
        staffId,
        date: e.date,
        kind: "regular",
        hours: regularTaken,
        multiplier: 1.0,
      });
    }
    if (dailyOtTaken > 0) {
      out.push({
        recordId: e.record.id,
        staffId,
        date: e.date,
        kind: "daily_ot",
        hours: dailyOtTaken,
        multiplier: overtimeRules.daily_ot_multiplier,
      });
    }
    if (weeklyOtTaken > 0) {
      out.push({
        recordId: e.record.id,
        staffId,
        date: e.date,
        kind: "weekly_ot",
        hours: weeklyOtTaken,
        multiplier: overtimeRules.weekly_ot_multiplier,
      });
    }
  }

  return out;
}
