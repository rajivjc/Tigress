import { describe, expect, it } from "vitest";
import { formatRunAsCsv } from "@/scheduling/payroll/lib/csv";
import type {
  PayrollLineItem,
  PayrollRun,
  PayrollSettings,
  PayrollVenueBranding,
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

const SETTINGS: Pick<PayrollSettings, "currency" | "timezone"> = {
  currency: "SGD",
  timezone: "Asia/Singapore",
};

const BRANDING: PayrollVenueBranding = {
  id: "brand-1",
  venue_name: "Tigress",
  address: "",
  contact_email: "",
  contact_phone: "",
  logo_url: "",
  created_at: FIXED_TS,
  updated_at: FIXED_TS,
};

const EXPORTER = { staffId: "owner-1", name: "Olivia Owner" };
const EXPORTED_AT = "2026-06-02T09:00:00.000Z";

function csvFor(input: {
  lineItems: PayrollLineItem[];
  staff: { id: string; full_name: string }[];
  run?: PayrollRun;
}): string {
  return formatRunAsCsv({
    run: input.run ?? RUN,
    lineItems: input.lineItems,
    staff: input.staff,
    venueBranding: BRANDING,
    settings: SETTINGS,
    exporter: EXPORTER,
    exportedAt: EXPORTED_AT,
  });
}

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
    const csv = csvFor({ lineItems: [], staff: [] });
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
    const csv = csvFor({
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
    const csv = csvFor({
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
    const csv = csvFor({ lineItems: items, staff: [{ id: "u1", full_name: "X" }] });
    const row = csv.split("\n")[1].split(",");
    // gross at index 20, net at 21
    expect(row[row.length - 2]).toBe("1000.00");
    expect(row[row.length - 1]).toBe("700.00");
  });

  it(
    "gross/net are round-of-sum, not sum-of-rounded — uses inputs that diverge (S27a-fix-2 Finding 12)",
    () => {
      // Three items at amount=0.025 each. JS Math.round() rounds half-away-
      // from-zero: Math.round(2.5) = 3, so an individually-rounded amount
      // becomes 0.03 each. Sum-of-rounded would give 0.09 for gross. The
      // transformer accumulates raw and rounds ONCE: Math.round(7.5) = 8,
      // so round-of-sum gives 0.08. The two paths produce different
      // outputs at this scale — assert the round-of-sum output.
      const items: PayrollLineItem[] = [
        li({ id: "1", staff_id: "u1", kind: "hours", amount: 0.025 }),
        li({ id: "2", staff_id: "u1", kind: "hours", amount: 0.025 }),
        li({ id: "3", staff_id: "u1", kind: "hours", amount: 0.025 }),
      ];
      const csv = csvFor({
        lineItems: items,
        staff: [{ id: "u1", full_name: "X" }],
      });
      const header = csv.split("\n")[0].split(",");
      const row = csv.split("\n")[1].split(",");
      expect(row[header.indexOf("gross")]).toBe("0.08");
      expect(row[header.indexOf("net")]).toBe("0.08");
      // Sanity check the sum-of-rounded path would have produced 0.09.
      const sumOfRounded =
        Math.round(0.025 * 100) / 100 +
        Math.round(0.025 * 100) / 100 +
        Math.round(0.025 * 100) / 100;
      expect(sumOfRounded).toBe(0.09);
    }
  );

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
    const csv = csvFor({
      lineItems: items,
      staff: [{ id: "u1", full_name: "X" }],
    });
    const row = csv.split("\n")[1].split(",");
    const header = csv.split("\n")[0].split(",");
    expect(row[header.indexOf("daily_ot_amount")]).toBe("100.00");
    expect(row[header.indexOf("weekly_ot_amount")]).toBe("50.00");
  });
});
