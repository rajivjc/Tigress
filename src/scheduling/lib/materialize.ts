// =============================================================================
// Scheduling — FT materialization (Session 25)
// =============================================================================
// Pure function: given a Monday-anchored week_start_date, the list of FT
// standing assignments, and the template day-coverage rows, produce a list
// of DraftShifts to insert when the manager creates the week. Skips
// assignments whose template doesn't run on that day-of-week.
// =============================================================================

import type {
  DayOfWeek,
  DraftShift,
  FtAssignment,
  ShiftTemplate,
  TemplateDayCoverage,
} from "../types";

const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface MaterializeInput {
  weekStartDate: string; // YYYY-MM-DD, Monday
  ftAssignments: FtAssignment[];
  templates: ShiftTemplate[];
  dayCoverage: TemplateDayCoverage[];
}

/**
 * Returns one DraftShift per FT assignment that lands inside the given
 * week. An assignment lands when:
 *   1. effective_from <= shift_date <= (effective_until ?? +infinity)
 *   2. the linked template has a day_coverage row for that day_of_week
 *      (i.e. the template runs that day)
 *   3. the linked template is_active
 */
export function materializeFTAssignments(
  input: MaterializeInput
): DraftShift[] {
  const { weekStartDate, ftAssignments, templates, dayCoverage } = input;

  const templateById = new Map(templates.map((t) => [t.id, t]));
  const coverageKey = (templateId: string, dow: number) =>
    `${templateId}::${dow}`;
  const coverageIndex = new Set(
    dayCoverage.map((c) => coverageKey(c.template_id, c.day_of_week))
  );

  const out: DraftShift[] = [];
  for (let dow = 0; dow < DAYS_PER_WEEK; dow++) {
    const shiftDate = addDaysIso(weekStartDate, dow);
    for (const fa of ftAssignments) {
      if (fa.day_of_week !== dow) continue;
      if (fa.effective_from > shiftDate) continue;
      if (fa.effective_until !== null && fa.effective_until < shiftDate) {
        continue;
      }
      const tmpl = templateById.get(fa.template_id);
      if (!tmpl) continue;
      if (!tmpl.is_active) continue;
      if (!coverageIndex.has(coverageKey(fa.template_id, dow))) continue;

      out.push({
        template_id: fa.template_id,
        shift_date: shiftDate,
        start_time: tmpl.start_time,
        end_time: tmpl.end_time,
        role: fa.role,
        user_id: fa.user_id,
      });
    }
  }
  return out;
}

/**
 * Adds N days to a YYYY-MM-DD string and returns a new YYYY-MM-DD string.
 * UTC math — fine because YYYY-MM-DD has no time component.
 */
export function addDaysIso(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + days * MS_PER_DAY;
  const dt = new Date(ms);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Returns the Monday-anchored week_start_date for a given YYYY-MM-DD.
 * Monday = day_of_week 0 in our convention.
 */
export function weekStartFor(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay: Sunday=0 .. Saturday=6 — convert to Monday-based.
  const mondayBased = (date.getUTCDay() + 6) % DAYS_PER_WEEK;
  return addDaysIso(dateStr, -mondayBased);
}

/**
 * Returns the day_of_week (0=Mon..6=Sun) for a given YYYY-MM-DD.
 */
export function dayOfWeekFor(dateStr: string): DayOfWeek {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return ((date.getUTCDay() + 6) % DAYS_PER_WEEK) as DayOfWeek;
}
