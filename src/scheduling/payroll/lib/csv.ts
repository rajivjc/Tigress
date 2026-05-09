// =============================================================================
// Payroll — CSV export formatter (Session 27a, refactored S27b)
// =============================================================================
// Thin flattener over the payslip transformer (lib/payslip-transformer.ts).
// All aggregation lives in the transformer so PDF / JSON / CSV share one
// pass and identical totals. CSV column shape is intentionally unchanged
// from S27a — accountant scripts depending on the v1 layout keep working.
// =============================================================================

import {
  buildPayslipDocument,
  type BuildPayslipDocumentInput,
} from "./payslip-transformer";

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

export type CsvExportInput = BuildPayslipDocumentInput;

export function formatRunAsCsv(input: CsvExportInput): string {
  const doc = buildPayslipDocument(input);
  const lines = [COLUMNS.map(escapeCsv).join(",")];

  for (const section of doc.staff) {
    const t = section.totals;
    const row = [
      section.staff_id,
      section.full_name,
      doc.run.period_start,
      doc.run.period_end,
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
      fmt(t.gross),
      fmt(t.net),
    ];
    lines.push(row.map(escapeCsv).join(","));
  }
  return lines.join("\n") + "\n";
}
