// =============================================================================
// Payroll — TypeScript types (Session 27a)
// =============================================================================
// Mirrors the schema in supabase/migrations/020_payroll.sql.
// snake_case matches the Supabase response shape directly.
// =============================================================================

export type PayFrequency = "weekly" | "fortnightly" | "monthly";
export type PayrollExportFormat = "csv" | "pdf" | "json";
export type RestDayStrategy = "sunday" | "configured_per_staff" | "none";
export type RateRuleKind = "role" | "time_of_day";
export type PayrollRunStatus = "draft" | "review" | "locked";

export type PayrollLineItemSource = "engine" | "manual";

export type PayrollLineItemKind =
  | "hours"
  | "overtime"
  | "rest_day"
  | "public_holiday"
  | "allowance"
  | "tip"
  | "bonus"
  | "deduction"
  | "statutory"
  | "other";

export const PAYROLL_LINE_ITEM_KINDS: PayrollLineItemKind[] = [
  "hours",
  "overtime",
  "rest_day",
  "public_holiday",
  "allowance",
  "tip",
  "bonus",
  "deduction",
  "statutory",
  "other",
];

export const PAYROLL_ENGINE_KINDS: PayrollLineItemKind[] = [
  "hours",
  "overtime",
  "rest_day",
  "public_holiday",
  "statutory",
];

export const PAYROLL_MANUAL_KINDS: PayrollLineItemKind[] = [
  "allowance",
  "tip",
  "bonus",
  "deduction",
  "other",
];

export interface PayrollSettings {
  id: string;
  pay_frequency: PayFrequency;
  payment_offset_days: number;
  default_export_format: PayrollExportFormat;
  statutory_deduction_pct: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollRate {
  id: string;
  staff_id: string;
  hourly_rate: number;
  effective_from: string;
  effective_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollRateRule {
  id: string;
  kind: RateRuleKind;
  match_value: string;
  window_start: string | null;
  window_end: string | null;
  multiplier: number;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PayrollOvertimeRules {
  id: string;
  weekly_threshold_hours: number | null;
  weekly_ot_multiplier: number;
  daily_threshold_hours: number | null;
  daily_ot_multiplier: number;
  rest_day_multiplier: number;
  public_holiday_multiplier: number;
  rest_day_strategy: RestDayStrategy;
  created_at: string;
  updated_at: string;
}

export interface PayrollHoliday {
  date: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface PayrollRun {
  id: string;
  period_start: string;
  period_end: string;
  payment_date: string;
  status: PayrollRunStatus;
  locked_at: string | null;
  locked_by: string | null;
  unlock_note: string | null;
  last_computed_at: string | null;
  last_exported_at: string | null;
  last_export_format: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollLineItem {
  id: string;
  run_id: string;
  staff_id: string;
  kind: PayrollLineItemKind;
  label: string;
  amount: number;
  hours: number | null;
  rate_applied: number | null;
  multipliers: Record<string, number> | null;
  source: PayrollLineItemSource;
  clock_record_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollRunReconciliation {
  run_id: string;
  clock_records: unknown;
  rates_snapshot: unknown;
  overtime_rules_snapshot: unknown;
  holidays_snapshot: unknown;
  locked_at: string;
}

// ---------- View-models / aggregates ----------

export interface PayrollRunSummary {
  run: PayrollRun;
  gross: number;
  net: number;
  staff_count: number;
}

export interface PayrollPerStaffTotals {
  staff_id: string;
  hours_total: number;
  gross: number;
  net: number;
}

// ---------- Audit event types ----------

export type PayrollAuditEventType =
  | "payroll.settings.updated"
  | "payroll.rate.set"
  | "payroll.rate.ended"
  | "payroll.rate_rule.upserted"
  | "payroll.rate_rule.removed"
  | "payroll.overtime_rules.updated"
  | "payroll.holiday.upserted"
  | "payroll.holiday.removed"
  | "payroll.run.created"
  | "payroll.run.recomputed"
  | "payroll.run.attested"
  | "payroll.run.unattested"
  | "payroll.run.locked"
  | "payroll.run.unlocked"
  | "payroll.run.deleted"
  | "payroll.run.exported"
  | "payroll.line_item.added"
  | "payroll.line_item.updated"
  | "payroll.line_item.deleted";
