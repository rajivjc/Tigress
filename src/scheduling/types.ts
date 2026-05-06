// =============================================================================
// Scheduling — TypeScript types (Session 25)
// =============================================================================
// Mirrors the schema in supabase/migrations/018_scheduling.sql. snake_case
// matches the Supabase response shape directly.
// =============================================================================

export type Qualification = "bartender" | "floor" | "mod";

export const QUALIFICATIONS: Qualification[] = ["bartender", "floor", "mod"];

export type WeekStatus = "draft" | "published" | "archived";

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Map of qualification -> required count for a single day of a single template. */
export type RoleRequirements = Partial<Record<Qualification, number>>;

export interface ShiftTemplate {
  id: string;
  name: string;
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateDayCoverage {
  id: string;
  template_id: string;
  day_of_week: number;
  role_requirements: RoleRequirements;
  created_at: string;
  updated_at: string;
}

export interface UserQualification {
  user_id: string;
  qualification: Qualification;
  created_at: string;
}

export interface FtAssignment {
  id: string;
  user_id: string;
  template_id: string;
  day_of_week: number;
  role: Qualification;
  effective_from: string; // YYYY-MM-DD
  effective_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityBlock {
  id: string;
  user_id: string;
  week_start_date: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  note: string | null;
  created_at: string;
}

export interface ScheduleWeek {
  id: string;
  week_start_date: string;
  status: WeekStatus;
  published_at: string | null;
  published_by: string | null;
  publish_override_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleShift {
  id: string;
  week_id: string;
  template_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  user_id: string | null;
  role: Qualification;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- View-models / aggregates ----------

export interface ShiftWithMeta {
  shift: ScheduleShift;
  template_name: string;
  user_full_name: string | null;
}

export interface ShiftCoverageReport {
  shift_id: string;
  required: RoleRequirements;
  assigned: RoleRequirements;
  unfilled_roles: Qualification[];
}

export interface WeekCoverageReport {
  ok: boolean;
  per_shift: ShiftCoverageReport[];
  gaps: Array<{
    shift_date: string;
    template_id: string;
    role: Qualification;
    required: number;
    assigned: number;
  }>;
}

export interface DraftShift {
  template_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  role: Qualification;
  user_id: string | null;
}

// ---------- Audit event types ----------

export type ScheduleAuditEventType =
  | "schedule.template.created"
  | "schedule.template.updated"
  | "schedule.template.deleted"
  | "schedule.template_day_coverage.set"
  | "schedule.template_day_coverage.removed"
  | "schedule.qualifications.updated"
  | "schedule.ft_assignment.created"
  | "schedule.ft_assignment.ended"
  | "schedule.availability.submitted"
  | "schedule.availability.late_submitted"
  | "schedule.week.created"
  | "schedule.week.copied_from"
  | "schedule.shift.assigned"
  | "schedule.shift.unassigned"
  | "schedule.shift.time_overridden"
  | "schedule.shift.removed"
  | "schedule.week.published"
  | "schedule.week.published_with_override"
  | "schedule.week.unpublished";
