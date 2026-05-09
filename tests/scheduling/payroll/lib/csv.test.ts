import { describe, expect, it } from "vitest";
import { formatRunAsCsv } from "@/scheduling/payroll/lib/csv";
import type {
  PayrollLineItem,
  PayrollRun,
} from "@/scheduling/payroll/types";

const FIXED_TS = "2025-01-01T00:00:00.000Z";

const RUN: PayrollRun = {
  id: "run-1",
  period_start: "2026-05-01",
  period_end: "2026-05-31",
  payment_date: "2026-06-07",
  status: "locked",
  locked_at: FIXED_TS,
  locked_by: "owner-1",
  unlocked_at: null,
  unlocked_by: null,
  unlock_note: null,
  last_computed_at: FIXED_TS,
  last_exported_at: null,
  last_export_format: null,
  created_at: FIXED_TS,
  updated_at: FIXED_TS,
};

function li(partial: Partial<PayrollLineItem> & { id: string; staff_id: string; kind: PayrollLineItem["kind"]; amount: number }): PayrollLineItem {
  return {
    id: partial.id,
    run_id: partial.run_id ?? "run-1",
    staff_id: partial.staff_id,
    kind: partial.kind,
    label: partial.label ?? partial.kind,
    amount: partial.amount,
    hours: partial.hours ?? null,
    rate_applied: partial.rate_applied ?? null,
    multipliers: partial.multipliers ?? null,
    source: partial.source ?? "engine",
    clock_record_id: null,
    notes: null,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
  };
}

describe("formatRunAsCsv", () => {
  it("returns header-only CSV when there are no line items", () => {
    const csv = formatRunAsCsv({
      run: RUN,
      lineItems: [],
      staff: [],
    });
    const lines = csv.split("\n");
    expect(lines[0]).toContain("staff_id");
    expect(lines[0]).toContain("net");
    expect(lines.filter((l) => l.length > 0)).toHaveLength(1);
  });

  it("produces a deterministic snapshot for a representative run", () => {
    const items: PayrollLineItem[] = [
      li({ id: "1", staff_id: "u1", kind: "hours", amount: 800, hours: 40, rate_applied: 20 }),
      li({ id: "2", staff_id: "u1", kind: "overtime", amount: 60, hours: 2, rate_applied: 30 }),
      li({ id: "3", staff_id: "u1", kind: "allowance", amount: 50, source: "manual" }),
      li({ id: "4", staff_id: "u1", kind: "deduction", amount: -25, source: "manual" }),
      li({ id: "5", staff_id: "u2", kind: "hours", amount: 1000, hours: 40, rate_applied: 25 }),
    ];
    const csv = formatRunAsCsv({
      run: RUN,
      lineItems: items,
      staff: [
        { id: "u1", full_name: "Alice" },
        { id: "u2", full_name: "Bob" },
      ],
    });
    expect(csv).toMatchInlineSnapshot(`
      "staff_id,staff_name,period_start,period_end,regular_hours,regular_amount,daily_ot_hours,daily_ot_amount,weekly_ot_hours,weekly_ot_amount,rest_day_hours,rest_day_amount,public_holiday_hours,public_holiday_amount,allowances_total,tips_total,bonuses_total,deductions_total,statutory_total,other_total,gross,net
      u1,Alice,2026-05-01,2026-05-31,40.00,800.00,0.00,0.00,2.00,60.00,0.00,0.00,0.00,0.00,50.00,0.00,0.00,-25.00,0.00,0.00,910.00,885.00
      u2,Bob,2026-05-01,2026-05-31,40.00,1000.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,1000.00,1000.00
      "
    `);
  });

  it("escapes commas in staff names", () => {
    const items = [
      li({ id: "1", staff_id: "u1", kind: "hours", amount: 100, hours: 5, rate_applied: 20 }),
    ];
    const csv = formatRunAsCsv({
      run: RUN,
      lineItems: items,
      staff: [{ id: "u1", full_name: "Doe, Jane" }],
    });
    expect(csv).toContain('"Doe, Jane"');
  });

  it("net = gross + deductions + statutory", () => {
    const items: PayrollLineItem[] = [
      li({ id: "1", staff_id: "u1", kind: "hours", amount: 1000, hours: 40, rate_applied: 25 }),
      li({ id: "2", staff_id: "u1", kind: "deduction", amount: -100, source: "manual" }),
      li({ id: "3", staff_id: "u1", kind: "statutory", amount: -200 }),
    ];
    const csv = formatRunAsCsv({
      run: RUN,
      lineItems: items,
      staff: [{ id: "u1", full_name: "X" }],
    });
    const row = csv.split("\n")[1].split(",");
    // gross at index 20, net at 21
    expect(row[row.length - 2]).toBe("1000.00");
    expect(row[row.length - 1]).toBe("700.00");
  });

  it("gross/net are round-of-sum, not sum-of-rounded across many small items (S27a-fix-2 Finding 6)", () => {
    // Synthesise 100 line items at 0.01 each. Sum-of-rounded == round-of-sum
    // for 2dp values, but the structural change to use a dedicated
    // unrounded accumulator means gross is computed once and rounded once.
    // Verify the published gross matches the round-of-sum value exactly.
    const items: PayrollLineItem[] = [];
    for (let i = 0; i < 100; i++) {
      items.push(
        li({
          id: `i${i}`,
          staff_id: "u1",
          kind: "hours",
          amount: 0.01,
          hours: 0.001,
          rate_applied: 10,
        })
      );
    }
    // Plus a deduction so the net path is exercised too.
    items.push(
      li({ id: "d1", staff_id: "u1", kind: "deduction", amount: -0.33, source: "manual" })
    );
    const csv = formatRunAsCsv({
      run: RUN,
      lineItems: items,
      staff: [{ id: "u1", full_name: "X" }],
    });
    const header = csv.split("\n")[0].split(",");
    const row = csv.split("\n")[1].split(",");
    // gross = round(100 × 0.01) = 1.00 (positive items only)
    expect(row[header.indexOf("gross")]).toBe("1.00");
    // net = round(1.00 + -0.33) = 0.67
    expect(row[header.indexOf("net")]).toBe("0.67");
  });

  it("groups daily_ot vs weekly_ot when multipliers map flags", () => {
    const items: PayrollLineItem[] = [
      li({
        id: "1",
        staff_id: "u1",
        kind: "overtime",
        amount: 100,
        hours: 4,
        multipliers: { "ot:daily_ot": 1.5 },
      }),
      li({
        id: "2",
        staff_id: "u1",
        kind: "overtime",
        amount: 50,
        hours: 2,
        multipliers: { "ot:weekly_ot": 1.5 },
      }),
    ];
    const csv = formatRunAsCsv({
      run: RUN,
      lineItems: items,
      staff: [{ id: "u1", full_name: "X" }],
    });
    const row = csv.split("\n")[1].split(",");
    // header order has daily_ot_hours,daily_ot_amount,weekly_ot_hours,weekly_ot_amount
    // Find indices.
    const header = csv.split("\n")[0].split(",");
    expect(row[header.indexOf("daily_ot_amount")]).toBe("100.00");
    expect(row[header.indexOf("weekly_ot_amount")]).toBe("50.00");
  });
});
