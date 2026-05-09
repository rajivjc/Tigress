// =============================================================================
// Payroll — mock data (Session 27a)
// =============================================================================
// Module-owned mock arrays so the data layer can branch into mock mode
// without touching the top-level mock-data files.
// =============================================================================

import type {
  PayrollHoliday,
  PayrollLineItem,
  PayrollOvertimeRules,
  PayrollRate,
  PayrollRateRule,
  PayrollRun,
  PayrollRunReconciliation,
  PayrollSettings,
} from "../types";

const fixed = "2025-01-01T00:00:00.000Z";

export const MOCK_PAYROLL_SETTINGS: PayrollSettings[] = [
  {
    id: "payroll-settings-1",
    pay_frequency: "monthly",
    payment_offset_days: 7,
    default_export_format: "csv",
    statutory_deduction_pct: 0,
    currency: "SGD",
    created_at: fixed,
    updated_at: fixed,
  },
];

export const MOCK_PAYROLL_OVERTIME_RULES: PayrollOvertimeRules[] = [
  {
    id: "payroll-ot-1",
    weekly_threshold_hours: 44,
    weekly_ot_multiplier: 1.5,
    daily_threshold_hours: null,
    daily_ot_multiplier: 1.5,
    rest_day_multiplier: 2.0,
    public_holiday_multiplier: 2.0,
    rest_day_strategy: "sunday",
    created_at: fixed,
    updated_at: fixed,
  },
];

// Pre-seed 2026 SG public holidays.
export const MOCK_PAYROLL_HOLIDAYS: PayrollHoliday[] = [
  { date: "2026-01-01", name: "New Year's Day", is_active: true, created_at: fixed },
  { date: "2026-02-17", name: "Chinese New Year", is_active: true, created_at: fixed },
  { date: "2026-02-18", name: "Chinese New Year", is_active: true, created_at: fixed },
  { date: "2026-04-03", name: "Good Friday", is_active: true, created_at: fixed },
  { date: "2026-05-01", name: "Labour Day", is_active: true, created_at: fixed },
  { date: "2026-05-31", name: "Vesak Day", is_active: true, created_at: fixed },
  { date: "2026-06-01", name: "Vesak Day (observed)", is_active: true, created_at: fixed },
  { date: "2026-08-09", name: "National Day", is_active: true, created_at: fixed },
  { date: "2026-08-10", name: "National Day (observed)", is_active: true, created_at: fixed },
  { date: "2026-11-08", name: "Deepavali", is_active: true, created_at: fixed },
  { date: "2026-11-09", name: "Deepavali (observed)", is_active: true, created_at: fixed },
  { date: "2026-12-25", name: "Christmas Day", is_active: true, created_at: fixed },
];

// Seed a base hourly rate for each mock staff so the engine has something
// to compute on. Rates are open-ended (effective_until = null).
export const MOCK_PAYROLL_RATES: PayrollRate[] = [
  {
    id: "payroll-rate-staff-1",
    staff_id: "mock-staff-row-1",
    hourly_rate: 16,
    effective_from: "2025-01-01",
    effective_until: null,
    created_at: fixed,
    updated_at: fixed,
  },
  {
    id: "payroll-rate-staff-2",
    staff_id: "mock-staff-row-2",
    hourly_rate: 22,
    effective_from: "2025-01-01",
    effective_until: null,
    created_at: fixed,
    updated_at: fixed,
  },
  {
    id: "payroll-rate-staff-3",
    staff_id: "mock-staff-row-3",
    hourly_rate: 28,
    effective_from: "2025-01-01",
    effective_until: null,
    created_at: fixed,
    updated_at: fixed,
  },
  {
    id: "payroll-rate-staff-4",
    staff_id: "mock-staff-row-4",
    hourly_rate: 14,
    effective_from: "2025-01-01",
    effective_until: null,
    created_at: fixed,
    updated_at: fixed,
  },
  {
    id: "payroll-rate-staff-5",
    staff_id: "mock-staff-row-5",
    hourly_rate: 14,
    effective_from: "2025-01-01",
    effective_until: null,
    created_at: fixed,
    updated_at: fixed,
  },
];

export const MOCK_PAYROLL_RATE_RULES: PayrollRateRule[] = [];
export const MOCK_PAYROLL_RUNS: PayrollRun[] = [];
export const MOCK_PAYROLL_LINE_ITEMS: PayrollLineItem[] = [];
export const MOCK_PAYROLL_RECONCILIATION: PayrollRunReconciliation[] = [];

/** Test hook — full reset of the mutable arrays. */
export function __resetMockPayroll(): void {
  MOCK_PAYROLL_RUNS.length = 0;
  MOCK_PAYROLL_LINE_ITEMS.length = 0;
  MOCK_PAYROLL_RECONCILIATION.length = 0;
  MOCK_PAYROLL_RATE_RULES.length = 0;
  // Reset settings + ot rules + rates + holidays back to seeds.
  MOCK_PAYROLL_SETTINGS.length = 1;
  MOCK_PAYROLL_SETTINGS[0] = {
    id: "payroll-settings-1",
    pay_frequency: "monthly",
    payment_offset_days: 7,
    default_export_format: "csv",
    statutory_deduction_pct: 0,
    currency: "SGD",
    created_at: fixed,
    updated_at: fixed,
  };
  MOCK_PAYROLL_OVERTIME_RULES.length = 1;
  MOCK_PAYROLL_OVERTIME_RULES[0] = {
    id: "payroll-ot-1",
    weekly_threshold_hours: 44,
    weekly_ot_multiplier: 1.5,
    daily_threshold_hours: null,
    daily_ot_multiplier: 1.5,
    rest_day_multiplier: 2.0,
    public_holiday_multiplier: 2.0,
    rest_day_strategy: "sunday",
    created_at: fixed,
    updated_at: fixed,
  };
}
