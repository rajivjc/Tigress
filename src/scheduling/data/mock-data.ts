// =============================================================================
// Scheduling — mock data (Session 25)
// =============================================================================
// Module-owned mock arrays so we don't have to touch the top-level
// src/lib/data/mock-data.ts when adjusting scheduling fixtures. The
// top-level resetMockData() helper imports + clones these arrays so tests
// stay isolated.
// =============================================================================

import type {
  AvailabilityBlock,
  ClockCorrection,
  ClockRecord,
  FtAssignment,
  ScheduleShift,
  ScheduleWeek,
  ShiftAttendance,
  ShiftChangeRequest,
  ShiftNotificationSent,
  ShiftTemplate,
  TemplateDayCoverage,
  UserQualification,
} from "../types";
import { weekStartFor } from "../lib/materialize";

const fixed = "2025-01-01T00:00:00.000Z";

// ---------- Templates ----------

export const MOCK_SCHEDULE_TEMPLATES: ShiftTemplate[] = [
  {
    id: "schedule-template-am",
    name: "AM",
    start_time: "10:00:00",
    end_time: "18:00:00",
    sort_order: 1,
    is_active: true,
    created_at: fixed,
    updated_at: fixed,
  },
  {
    id: "schedule-template-pm",
    name: "PM",
    start_time: "17:00:00",
    end_time: "24:00:00",
    sort_order: 2,
    is_active: true,
    created_at: fixed,
    updated_at: fixed,
  },
  {
    id: "schedule-template-closer",
    name: "Closer",
    start_time: "19:00:00",
    end_time: "24:00:00",
    sort_order: 3,
    is_active: true,
    created_at: fixed,
    updated_at: fixed,
  },
];

// ---------- Day coverage ----------
// 0 = Mon, 6 = Sun (Monday-based).
//
// AM runs every day, PM runs every day (with bigger weekend bartender
// staffing), Closer runs Fri/Sat only.

function dayCoverageFactory(): TemplateDayCoverage[] {
  const rows: TemplateDayCoverage[] = [];
  let cursor = 1;
  // AM: Mon-Sun
  for (let dow = 0; dow < 7; dow++) {
    rows.push({
      id: `schedule-coverage-am-${dow}`,
      template_id: "schedule-template-am",
      day_of_week: dow,
      role_requirements: { bartender: 1, floor: 1, mod: 1 },
      created_at: fixed,
      updated_at: fixed,
    });
    cursor++;
  }
  // PM: Mon-Thu (0..3) + Sun (6) = single bartender; Fri/Sat (4,5) = two.
  for (let dow = 0; dow < 7; dow++) {
    const isWeekend = dow === 4 || dow === 5;
    rows.push({
      id: `schedule-coverage-pm-${dow}`,
      template_id: "schedule-template-pm",
      day_of_week: dow,
      role_requirements: {
        bartender: isWeekend ? 2 : 1,
        floor: 1,
        mod: 1,
      },
      created_at: fixed,
      updated_at: fixed,
    });
    cursor++;
  }
  // Closer: Fri/Sat only.
  for (const dow of [4, 5]) {
    rows.push({
      id: `schedule-coverage-closer-${dow}`,
      template_id: "schedule-template-closer",
      day_of_week: dow,
      role_requirements: { bartender: 1 },
      created_at: fixed,
      updated_at: fixed,
    });
    cursor++;
  }
  return rows;
}

export const MOCK_SCHEDULE_DAY_COVERAGE: TemplateDayCoverage[] =
  dayCoverageFactory();

// ---------- Qualifications ----------
// Manager + owner + Sam: every qualification.
// PT staff: a subset.

export const MOCK_SCHEDULE_QUALIFICATIONS: UserQualification[] = [
  // Sam Staff (FT)
  { user_id: "mock-staff-row-1", qualification: "bartender", created_at: fixed },
  { user_id: "mock-staff-row-1", qualification: "floor", created_at: fixed },
  { user_id: "mock-staff-row-1", qualification: "mod", created_at: fixed },
  // Maya Manager (FT)
  { user_id: "mock-staff-row-2", qualification: "bartender", created_at: fixed },
  { user_id: "mock-staff-row-2", qualification: "floor", created_at: fixed },
  { user_id: "mock-staff-row-2", qualification: "mod", created_at: fixed },
  // Olive Owner (FT)
  { user_id: "mock-staff-row-3", qualification: "bartender", created_at: fixed },
  { user_id: "mock-staff-row-3", qualification: "floor", created_at: fixed },
  { user_id: "mock-staff-row-3", qualification: "mod", created_at: fixed },
  // Pat Part-Time
  { user_id: "mock-staff-row-4", qualification: "bartender", created_at: fixed },
  // Phoebe Floor (PT)
  { user_id: "mock-staff-row-5", qualification: "floor", created_at: fixed },
  { user_id: "mock-staff-row-5", qualification: "bartender", created_at: fixed },
];

// ---------- FT standing assignments ----------
// Sam works AM Mon-Fri (bartender). Maya works PM Mon-Fri (mod).

function ftAssignmentsFactory(): FtAssignment[] {
  const rows: FtAssignment[] = [];
  for (let dow = 0; dow < 5; dow++) {
    rows.push({
      id: `schedule-ft-sam-${dow}`,
      user_id: "mock-staff-row-1",
      template_id: "schedule-template-am",
      day_of_week: dow,
      role: "bartender",
      effective_from: "2025-01-01",
      effective_until: null,
      created_at: fixed,
      updated_at: fixed,
    });
    rows.push({
      id: `schedule-ft-maya-${dow}`,
      user_id: "mock-staff-row-2",
      template_id: "schedule-template-pm",
      day_of_week: dow,
      role: "mod",
      effective_from: "2025-01-01",
      effective_until: null,
      created_at: fixed,
      updated_at: fixed,
    });
  }
  return rows;
}

export const MOCK_SCHEDULE_FT_ASSIGNMENTS: FtAssignment[] =
  ftAssignmentsFactory();

// ---------- Availability ----------
// One sample submission per PT user for the current week.

function currentWeekStart(): string {
  return weekStartFor(new Date().toISOString().slice(0, 10));
}

function availabilityFactory(): AvailabilityBlock[] {
  const ws = currentWeekStart();
  return [
    // Pat: Tue/Wed/Thu evenings
    {
      id: "schedule-availability-pat-tue",
      user_id: "mock-staff-row-4",
      week_start_date: ws,
      day_of_week: 1,
      start_time: "17:00:00",
      end_time: "23:59:00",
      note: null,
      created_at: fixed,
    },
    {
      id: "schedule-availability-pat-wed",
      user_id: "mock-staff-row-4",
      week_start_date: ws,
      day_of_week: 2,
      start_time: "17:00:00",
      end_time: "23:59:00",
      note: null,
      created_at: fixed,
    },
    {
      id: "schedule-availability-pat-thu",
      user_id: "mock-staff-row-4",
      week_start_date: ws,
      day_of_week: 3,
      start_time: "17:00:00",
      end_time: "23:59:00",
      note: null,
      created_at: fixed,
    },
    // Phoebe: Fri/Sat full evenings
    {
      id: "schedule-availability-phoebe-fri",
      user_id: "mock-staff-row-5",
      week_start_date: ws,
      day_of_week: 4,
      start_time: "17:00:00",
      end_time: "23:59:00",
      note: null,
      created_at: fixed,
    },
    {
      id: "schedule-availability-phoebe-sat",
      user_id: "mock-staff-row-5",
      week_start_date: ws,
      day_of_week: 5,
      start_time: "10:00:00",
      end_time: "23:59:00",
      note: null,
      created_at: fixed,
    },
  ];
}

export const MOCK_SCHEDULE_AVAILABILITY: AvailabilityBlock[] =
  availabilityFactory();

// ---------- Weeks + Shifts ----------
// Empty by default — created lazily by the manager workflow.

export const MOCK_SCHEDULE_WEEKS: ScheduleWeek[] = [];
export const MOCK_SCHEDULE_SHIFTS: ScheduleShift[] = [];

// ---------- Runtime arrays (Session 26) ----------
// Empty by default — populated lazily by the runtime flows (clock-in,
// swap requests, attendance flags, cron dedup).

export const MOCK_SCHEDULE_CLOCK_RECORDS: ClockRecord[] = [];
export const MOCK_SCHEDULE_CLOCK_CORRECTIONS: ClockCorrection[] = [];
export const MOCK_SCHEDULE_SHIFT_CHANGE_REQUESTS: ShiftChangeRequest[] = [];
export const MOCK_SCHEDULE_SHIFT_ATTENDANCE: ShiftAttendance[] = [];
export const MOCK_SCHEDULE_SHIFT_NOTIFICATIONS_SENT: ShiftNotificationSent[] = [];

/** Test hook — full reset of the lazily-created weeks + shifts. */
export function __resetMockScheduleWeeks(): void {
  MOCK_SCHEDULE_WEEKS.length = 0;
  MOCK_SCHEDULE_SHIFTS.length = 0;
  MOCK_SCHEDULE_CLOCK_RECORDS.length = 0;
  MOCK_SCHEDULE_CLOCK_CORRECTIONS.length = 0;
  MOCK_SCHEDULE_SHIFT_CHANGE_REQUESTS.length = 0;
  MOCK_SCHEDULE_SHIFT_ATTENDANCE.length = 0;
  MOCK_SCHEDULE_SHIFT_NOTIFICATIONS_SENT.length = 0;
}
