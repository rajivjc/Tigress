// =============================================================================
// Payroll — CSV export formatter (Session 27a)
// =============================================================================
// Pure function that takes a run + its line items + staff list and returns
// a CSV string. Flat one-row-per-staff-per-period format; all line-item
// kinds are columns. Negatives carry their sign on individual rows; `net`
// is the sum of all amounts.
// =============================================================================

import type { Staff } from "@/lib/types";
import type { PayrollLineItem, PayrollRun } from "../types";

const COLUMNS = [
  "staff_id",
  "staff_name",
  "period_start",
  "period_end",
  "regular_hours",
  "regular_amount",
  "daily_ot_hours",
  "daily_ot_amount",
  "weekly_ot_hours",
  "weekly_ot_amount",
  "rest_day_hours",
  "rest_day_amount",
  "public_holiday_hours",
  "public_holiday_amount",
  "allowances_total",
  "tips_total",
  "bonuses_total",
  "deductions_total",
  "statutory_total",
  "other_total",
  "gross",
  "net",
] as const;

function escapeCsv(v: string | number): string {
  const s = String(v);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

interface PerStaffTotals {
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
}

function emptyTotals(): PerStaffTotals {
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
  };
}

export interface CsvExportInput {
  run: PayrollRun;
  lineItems: PayrollLineItem[];
  staff: Pick<Staff, "id" | "full_name">[];
}

export function formatRunAsCsv(input: CsvExportInput): string {
  const { run, lineItems, staff } = input;

  const totalsByStaff = new Map<string, PerStaffTotals>();
  for (const item of lineItems) {
    const t = totalsByStaff.get(item.staff_id) ?? emptyTotals();
    const hours = item.hours ?? 0;
    switch (item.kind) {
      case "hours":
        t.regular_hours += hours;
        t.regular_amount += item.amount;
        break;
      case "overtime":
        // daily vs weekly OT are not distinguished in line-item data; we
        // treat all "overtime" line items as weekly_ot for export display.
        // (The engine emits separate line items per source kind, so this
        // is a label split, not a fidelity loss.)
        if (item.multipliers && (item.multipliers as Record<string, number>)["ot:daily_ot"]) {
          t.daily_ot_hours += hours;
          t.daily_ot_amount += item.amount;
        } else {
          t.weekly_ot_hours += hours;
          t.weekly_ot_amount += item.amount;
        }
        break;
      case "rest_day":
        t.rest_day_hours += hours;
        t.rest_day_amount += item.amount;
        break;
      case "public_holiday":
        t.public_holiday_hours += hours;
        t.public_holiday_amount += item.amount;
        break;
      case "allowance":
        t.allowances_total += item.amount;
        break;
      case "tip":
        t.tips_total += item.amount;
        break;
      case "bonus":
        t.bonuses_total += item.amount;
        break;
      case "deduction":
        t.deductions_total += item.amount;
        break;
      case "statutory":
        t.statutory_total += item.amount;
        break;
      case "other":
        t.other_total += item.amount;
        break;
    }
    totalsByStaff.set(item.staff_id, t);
  }

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const lines = [COLUMNS.map(escapeCsv).join(",")];

  // Stable ordering: staff id ascending.
  const staffIds = Array.from(totalsByStaff.keys()).sort();
  for (const sid of staffIds) {
    const t = totalsByStaff.get(sid)!;
    const name = staffById.get(sid)?.full_name ?? sid;
    const gross =
      t.regular_amount +
      t.daily_ot_amount +
      t.weekly_ot_amount +
      t.rest_day_amount +
      t.public_holiday_amount +
      t.allowances_total +
      t.tips_total +
      t.bonuses_total +
      t.other_total;
    const net = gross + t.deductions_total + t.statutory_total;
    const row = [
      sid,
      name,
      run.period_start,
      run.period_end,
      fmt(t.regular_hours),
      fmt(t.regular_amount),
      fmt(t.daily_ot_hours),
      fmt(t.daily_ot_amount),
      fmt(t.weekly_ot_hours),
      fmt(t.weekly_ot_amount),
      fmt(t.rest_day_hours),
      fmt(t.rest_day_amount),
      fmt(t.public_holiday_hours),
      fmt(t.public_holiday_amount),
      fmt(t.allowances_total),
      fmt(t.tips_total),
      fmt(t.bonuses_total),
      fmt(t.deductions_total),
      fmt(t.statutory_total),
      fmt(t.other_total),
      fmt(gross),
      fmt(net),
    ];
    lines.push(row.map(escapeCsv).join(","));
  }
  return lines.join("\n") + "\n";
}
