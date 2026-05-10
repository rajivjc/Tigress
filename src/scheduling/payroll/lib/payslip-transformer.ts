// =============================================================================
// Payroll — payslip document transformer (Session 27b)
// =============================================================================
// Pure function. Single source of truth that powers PDF rendering, JSON
// export, and the staff-side payslip UI. CSV export consumes the same
// document via a thin flattener (lib/csv.ts) so all four output formats
// share one aggregation pass and identical totals.
//
// Aggregation rules mirror the CSV formatter that S27a shipped:
//   * One PayslipStaffSection per staff that has at least one line item.
//   * Totals split overtime into daily_ot / weekly_ot using the
//     `ot:daily_ot` multiplier flag (engine emits separate items, but the
//     line-item kind is the same `"overtime"` for both).
//   * gross is the sum of every positive-contributing line-item kind:
//     hours + overtime + rest_day + public_holiday + allowance + tip +
//     bonus + other. Deduction + statutory subtract from net only — they
//     are NOT in gross.
//   * net is the sum of EVERY line item's amount (deduction + statutory
//     carry their negative sign on the row itself).
//   * gross / net use round-of-sum (S27a-fix-2 Finding 6 pattern):
//     unrounded accumulators sum every contribution, then round once.
// =============================================================================

import type { Staff } from "@/lib/types";
import type {
  PayrollLineItem,
  PayrollLineItemKind,
  PayrollLineItemSource,
  PayrollRun,
  PayrollRunStatus,
  PayrollSettings,
  PayrollVenueBranding,
} from "../types";

export const PAYSLIP_FORMAT_VERSION = "1.0" as const;

export interface PayslipLineItem {
  id: string;
  kind: PayrollLineItemKind;
  label: string;
  amount: number;
  hours: number | null;
  rate_applied: number | null;
  multipliers: Record<string, number> | null;
  source: PayrollLineItemSource;
  // Renamed from `clock_record_id` to make the aggregation honesty explicit
  // in the document shape. The line item summarises 1+ classified records;
  // we keep one representative id for drill-down, not the full set. The
  // staff-side payslip surfaces this with a "sample" label and a tooltip
  // explaining the line aggregates multiple records (Finding 14).
  sample_clock_record_id: string | null;
  notes: string | null;
}

export interface PayslipTotals {
  regular_hours: number;
  regular_amount: number;
  daily_ot_hours: number;
  daily_ot_amount: number;
  weekly_ot_hours: number;
  weekly_ot_amount: number;
  rest_day_hours: number;
  rest_day_amount: number;
  public_holiday_hours: number;
  public_holiday_amount: number;
  allowances_total: number;
  tips_total: number;
  bonuses_total: number;
  deductions_total: number;
  statutory_total: number;
  other_total: number;
  // gross / net are computed from independent unrounded accumulators and
  // rounded ONCE at the end (S27a-fix-2 Finding 6). Don't re-derive these
  // by summing the column fields above.
  gross: number;
  net: number;
}

export interface PayslipStaffSection {
  staff_id: string;
  full_name: string;
  totals: PayslipTotals;
  line_items: PayslipLineItem[];
}

export interface PayslipRunHeader {
  id: string;
  period_start: string;
  period_end: string;
  payment_date: string;
  status: PayrollRunStatus;
  locked_at: string | null;
  // Resolved name from the staff list; "Unknown" if the staff row is gone
  // (e.g. staff deleted after the lock — locked_by FK was ON DELETE SET
  // NULL, so we may also see "Not yet locked" via the null status branch).
  locked_by_name: string;
  currency: string;
  timezone: string;
}

export interface PayslipVenueHeader {
  name: string;
  address: string;
  contact_email: string;
  contact_phone: string;
  logo_url: string;
}

export interface PayslipMetadata {
  exported_at: string;
  exported_by: string;
  format_version: typeof PAYSLIP_FORMAT_VERSION;
}

export interface PayslipDocument {
  run: PayslipRunHeader;
  venue: PayslipVenueHeader;
  staff: PayslipStaffSection[];
  metadata: PayslipMetadata;
}

export interface BuildPayslipDocumentInput {
  run: PayrollRun;
  lineItems: PayrollLineItem[];
  staff: Pick<Staff, "id" | "full_name">[];
  venueBranding: PayrollVenueBranding;
  settings: Pick<PayrollSettings, "currency" | "timezone">;
  exporter: { staffId: string; name: string };
  // Injectable so snapshot tests can pin the timestamp. Omit in production —
  // the action layer always lets it default to now().
  exportedAt?: string;
}

interface UnroundedTotals {
  regular_hours: number;
  regular_amount: number;
  daily_ot_hours: number;
  daily_ot_amount: number;
  weekly_ot_hours: number;
  weekly_ot_amount: number;
  rest_day_hours: number;
  rest_day_amount: number;
  public_holiday_hours: number;
  public_holiday_amount: number;
  allowances_total: number;
  tips_total: number;
  bonuses_total: number;
  deductions_total: number;
  statutory_total: number;
  other_total: number;
  gross_unrounded: number;
  net_unrounded: number;
}

function emptyUnrounded(): UnroundedTotals {
  return {
    regular_hours: 0,
    regular_amount: 0,
    daily_ot_hours: 0,
    daily_ot_amount: 0,
    weekly_ot_hours: 0,
    weekly_ot_amount: 0,
    rest_day_hours: 0,
    rest_day_amount: 0,
    public_holiday_hours: 0,
    public_holiday_amount: 0,
    allowances_total: 0,
    tips_total: 0,
    bonuses_total: 0,
    deductions_total: 0,
    statutory_total: 0,
    other_total: 0,
    gross_unrounded: 0,
    net_unrounded: 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function freezeTotals(u: UnroundedTotals): PayslipTotals {
  return {
    regular_hours: round2(u.regular_hours),
    regular_amount: round2(u.regular_amount),
    daily_ot_hours: round2(u.daily_ot_hours),
    daily_ot_amount: round2(u.daily_ot_amount),
    weekly_ot_hours: round2(u.weekly_ot_hours),
    weekly_ot_amount: round2(u.weekly_ot_amount),
    rest_day_hours: round2(u.rest_day_hours),
    rest_day_amount: round2(u.rest_day_amount),
    public_holiday_hours: round2(u.public_holiday_hours),
    public_holiday_amount: round2(u.public_holiday_amount),
    allowances_total: round2(u.allowances_total),
    tips_total: round2(u.tips_total),
    bonuses_total: round2(u.bonuses_total),
    deductions_total: round2(u.deductions_total),
    statutory_total: round2(u.statutory_total),
    other_total: round2(u.other_total),
    gross: round2(u.gross_unrounded),
    net: round2(u.net_unrounded),
  };
}

function isDailyOt(item: PayrollLineItem): boolean {
  if (!item.multipliers) return false;
  const m = item.multipliers as Record<string, number>;
  return Boolean(m["ot:daily_ot"]);
}

function applyToTotals(t: UnroundedTotals, item: PayrollLineItem): void {
  const hours = item.hours ?? 0;
  // Net always rolls up every item — positives add, negatives subtract.
  t.net_unrounded += item.amount;
  switch (item.kind) {
    case "hours":
      t.regular_hours += hours;
      t.regular_amount += item.amount;
      t.gross_unrounded += item.amount;
      break;
    case "overtime":
      if (isDailyOt(item)) {
        t.daily_ot_hours += hours;
        t.daily_ot_amount += item.amount;
      } else {
        t.weekly_ot_hours += hours;
        t.weekly_ot_amount += item.amount;
      }
      t.gross_unrounded += item.amount;
      break;
    case "rest_day":
      t.rest_day_hours += hours;
      t.rest_day_amount += item.amount;
      t.gross_unrounded += item.amount;
      break;
    case "public_holiday":
      t.public_holiday_hours += hours;
      t.public_holiday_amount += item.amount;
      t.gross_unrounded += item.amount;
      break;
    case "allowance":
      t.allowances_total += item.amount;
      t.gross_unrounded += item.amount;
      break;
    case "tip":
      t.tips_total += item.amount;
      t.gross_unrounded += item.amount;
      break;
    case "bonus":
      t.bonuses_total += item.amount;
      t.gross_unrounded += item.amount;
      break;
    case "deduction":
      t.deductions_total += item.amount;
      break;
    case "statutory":
      t.statutory_total += item.amount;
      break;
    case "other":
      t.other_total += item.amount;
      t.gross_unrounded += item.amount;
      break;
  }
}

function toPayslipLineItem(item: PayrollLineItem): PayslipLineItem {
  return {
    id: item.id,
    kind: item.kind,
    label: item.label,
    amount: item.amount,
    hours: item.hours,
    rate_applied: item.rate_applied,
    multipliers: item.multipliers,
    source: item.source,
    sample_clock_record_id: item.clock_record_id,
    notes: item.notes,
  };
}

export function buildPayslipDocument(
  input: BuildPayslipDocumentInput
): PayslipDocument {
  const {
    run,
    lineItems,
    staff,
    venueBranding,
    settings,
    exporter,
    exportedAt,
  } = input;

  // Aggregate totals + collect line items per staff.
  const totalsByStaff = new Map<string, UnroundedTotals>();
  const itemsByStaff = new Map<string, PayslipLineItem[]>();

  for (const item of lineItems) {
    const t = totalsByStaff.get(item.staff_id) ?? emptyUnrounded();
    applyToTotals(t, item);
    totalsByStaff.set(item.staff_id, t);

    const existing = itemsByStaff.get(item.staff_id);
    if (existing) {
      existing.push(toPayslipLineItem(item));
    } else {
      itemsByStaff.set(item.staff_id, [toPayslipLineItem(item)]);
    }
  }

  const staffById = new Map(staff.map((s) => [s.id, s]));

  // Stable order: staff_id ascending. Matches the CSV ordering so any
  // automation that diffs both formats lines up.
  const staffIds = Array.from(totalsByStaff.keys()).sort();
  const sections: PayslipStaffSection[] = staffIds.map((sid) => ({
    staff_id: sid,
    full_name: staffById.get(sid)?.full_name ?? sid,
    totals: freezeTotals(totalsByStaff.get(sid)!),
    line_items: itemsByStaff.get(sid) ?? [],
  }));

  const lockerName = run.locked_by
    ? (staffById.get(run.locked_by)?.full_name ?? "Unknown")
    : "Not yet locked";

  return {
    run: {
      id: run.id,
      period_start: run.period_start,
      period_end: run.period_end,
      payment_date: run.payment_date,
      status: run.status,
      locked_at: run.locked_at,
      locked_by_name: lockerName,
      currency: settings.currency,
      timezone: settings.timezone,
    },
    venue: {
      name: venueBranding.venue_name,
      address: venueBranding.address,
      contact_email: venueBranding.contact_email,
      contact_phone: venueBranding.contact_phone,
      logo_url: venueBranding.logo_url,
    },
    staff: sections,
    metadata: {
      exported_at: exportedAt ?? new Date().toISOString(),
      exported_by: exporter.name,
      format_version: PAYSLIP_FORMAT_VERSION,
    },
  };
}

/** Filter the document to a single staff section. Used by the staff-side
 *  payslip view so a member of the run can read their own line items
 *  without seeing colleagues'. */
export function filterPayslipToStaff(
  doc: PayslipDocument,
  staffId: string
): PayslipDocument {
  return {
    ...doc,
    staff: doc.staff.filter((s) => s.staff_id === staffId),
  };
}
