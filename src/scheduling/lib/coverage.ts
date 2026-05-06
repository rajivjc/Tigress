// =============================================================================
// Scheduling — coverage validation (Session 25)
// =============================================================================
// Pure function: given the list of shifts in a week + the per-(template,
// day_of_week) role requirements, compute whether every required slot is
// filled. No DB, no React, no side-effects — fully unit-testable.
//
// "Required" means: for each (shift_date, template_id) shift the manager
// scaffolded, look up day_of_week from the date and find the matching
// day-coverage row. Each `role_requirements[role] = N` means there must be
// exactly N shifts on that date for that template assigned to a real user
// for that role. Unassigned slots (user_id = null) do NOT count toward
// coverage.
// =============================================================================

import type {
  Qualification,
  RoleRequirements,
  ScheduleShift,
  ShiftCoverageReport,
  TemplateDayCoverage,
  WeekCoverageReport,
} from "../types";
import { QUALIFICATIONS } from "../types";

const DAYS_PER_WEEK = 7;

/**
 * Returns 0..6 with Monday = 0 (matches the venue's week-starts-on-Monday
 * convention). The DB stores `day_of_week` 0..6 with the same convention so
 * a template that runs Mon..Fri stores rows with day_of_week 0..4.
 *
 * Mirrors the convention used in src/scheduling/lib/materialize.ts so the
 * two modules stay aligned.
 */
export function dayOfWeekFromIso(dateStr: string): number {
  // Date constructor with a YYYY-MM-DD string is parsed as UTC, which is fine
  // because we only care about the day-of-week — that's identical in any
  // timezone-of-record so long as we don't drift across midnight.
  const d = new Date(`${dateStr}T00:00:00Z`);
  // getUTCDay returns 0 = Sunday … 6 = Saturday. Convert to Monday-based.
  const sundayBased = d.getUTCDay();
  return (sundayBased + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
}

interface CoverageInput {
  shifts: ScheduleShift[];
  dayCoverage: TemplateDayCoverage[];
}

/**
 * Compute the per-shift and week-level coverage report. The shape lets the
 * UI overlay highlight unfilled roles per slot AND lets the publish action
 * gate-keep on a single boolean.
 */
export function validateWeekCoverage(input: CoverageInput): WeekCoverageReport {
  const { shifts, dayCoverage } = input;

  // Group shifts by (shift_date, template_id) so we can aggregate assigned
  // role counts before comparing to requirements. Each entry in the map
  // holds the requirement (resolved from the day_coverage table) and the
  // assigned counts.
  type GroupKey = string;
  const groupKey = (date: string, templateId: string): GroupKey =>
    `${date}::${templateId}`;

  // Build an index: (template_id, day_of_week) -> requirements row
  const coverageIndex = new Map<string, RoleRequirements>();
  for (const row of dayCoverage) {
    coverageIndex.set(
      `${row.template_id}::${row.day_of_week}`,
      row.role_requirements
    );
  }

  const groupAssigned = new Map<GroupKey, RoleRequirements>();
  for (const shift of shifts) {
    if (shift.user_id === null) continue;
    const k = groupKey(shift.shift_date, shift.template_id);
    const existing = groupAssigned.get(k) ?? {};
    existing[shift.role] = (existing[shift.role] ?? 0) + 1;
    groupAssigned.set(k, existing);
  }

  // Each shift row gets its own per-shift report (so the UI can colour
  // individual cards). Per-shift is "what's required at this template-on-
  // this-date" minus "what's assigned at this template-on-this-date" —
  // i.e. group-level data hung off every shift in that group.
  const perShift: ShiftCoverageReport[] = shifts.map((shift) => {
    const dow = dayOfWeekFromIso(shift.shift_date);
    const required =
      coverageIndex.get(`${shift.template_id}::${dow}`) ?? {};
    const assigned =
      groupAssigned.get(groupKey(shift.shift_date, shift.template_id)) ?? {};
    const unfilled: Qualification[] = [];
    for (const role of QUALIFICATIONS) {
      const need = required[role] ?? 0;
      const have = assigned[role] ?? 0;
      if (have < need) unfilled.push(role);
    }
    return {
      shift_id: shift.id,
      required,
      assigned,
      unfilled_roles: unfilled,
    };
  });

  // Week-level gaps — ONE entry per (date, template, role) combination
  // that's under-staffed. Iterate the requirements directly, not the
  // shifts, so a wholly-empty template-day still surfaces as a gap when
  // the manager has scaffolded zero shifts for it.
  const gaps: WeekCoverageReport["gaps"] = [];

  // Distinct template-date combos covered by either shifts or coverage rows
  // touching the dates in the shift set.
  const dateTemplatePairs = new Set<string>();
  for (const shift of shifts) {
    dateTemplatePairs.add(`${shift.shift_date}::${shift.template_id}`);
  }

  for (const pair of dateTemplatePairs) {
    const [date, templateId] = pair.split("::");
    const dow = dayOfWeekFromIso(date);
    const required = coverageIndex.get(`${templateId}::${dow}`) ?? {};
    const assigned = groupAssigned.get(pair) ?? {};
    for (const role of QUALIFICATIONS) {
      const need = required[role] ?? 0;
      const have = assigned[role] ?? 0;
      if (have < need) {
        gaps.push({
          shift_date: date,
          template_id: templateId,
          role,
          required: need,
          assigned: have,
        });
      }
    }
  }

  return { ok: gaps.length === 0, per_shift: perShift, gaps };
}
