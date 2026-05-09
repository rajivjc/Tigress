import { describe, expect, it } from "vitest";
import {
  buildPayslipDocument,
  filterPayslipToStaff,
  PAYSLIP_FORMAT_VERSION,
} from "@/scheduling/payroll/lib/payslip-transformer";
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
  locked_at: "2026-06-01T12:00:00.000Z",
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
  address: "1 Cue St, Singapore",
  contact_email: "ops@tigress.test",
  contact_phone: "+65 0000 0000",
  logo_url: "",
  created_at: FIXED_TS,
  updated_at: FIXED_TS,
};

const STAFF = [
  { id: "u1", full_name: "Alice" },
  { id: "u2", full_name: "Bob" },
  { id: "owner-1", full_name: "Olivia Owner" },
];

const EXPORTER = { staffId: "owner-1", name: "Olivia Owner" };
const EXPORTED_AT = "2026-06-02T09:00:00.000Z";

function li(
  partial: Partial<PayrollLineItem> & {
    id: string;
    staff_id: string;
    kind: PayrollLineItem["kind"];
    amount: number;
  }
): PayrollLineItem {
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
    clock_record_id: partial.clock_record_id ?? null,
    notes: partial.notes ?? null,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
  };
}

describe("buildPayslipDocument", () => {
  it("returns an empty staff array when the run has no line items", () => {
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: [],
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.staff).toEqual([]);
    expect(doc.run.id).toBe("run-1");
    expect(doc.metadata.format_version).toBe(PAYSLIP_FORMAT_VERSION);
  });

  it("builds a single-staff section with all line-item kinds", () => {
    const items: PayrollLineItem[] = [
      li({ id: "1", staff_id: "u1", kind: "hours", amount: 800, hours: 40, rate_applied: 20 }),
      li({ id: "2", staff_id: "u1", kind: "overtime", amount: 60, hours: 2, multipliers: { "ot:weekly_ot": 1.5 } }),
      li({ id: "3", staff_id: "u1", kind: "overtime", amount: 30, hours: 1, multipliers: { "ot:daily_ot": 1.5 } }),
      li({ id: "4", staff_id: "u1", kind: "rest_day", amount: 100, hours: 4 }),
      li({ id: "5", staff_id: "u1", kind: "public_holiday", amount: 200, hours: 8 }),
      li({ id: "6", staff_id: "u1", kind: "allowance", amount: 50, source: "manual" }),
      li({ id: "7", staff_id: "u1", kind: "tip", amount: 30, source: "manual" }),
      li({ id: "8", staff_id: "u1", kind: "bonus", amount: 20, source: "manual" }),
      li({ id: "9", staff_id: "u1", kind: "deduction", amount: -10, source: "manual" }),
      li({ id: "10", staff_id: "u1", kind: "statutory", amount: -90 }),
      li({ id: "11", staff_id: "u1", kind: "other", amount: 5, source: "manual" }),
    ];
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: items,
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.staff).toHaveLength(1);
    const section = doc.staff[0];
    expect(section.staff_id).toBe("u1");
    expect(section.full_name).toBe("Alice");
    expect(section.line_items).toHaveLength(11);
    // gross excludes deduction + statutory; everything else adds.
    // 800 + 60 + 30 + 100 + 200 + 50 + 30 + 20 + 5 = 1295
    expect(section.totals.gross).toBe(1295);
    // net rolls up everything: 1295 - 10 - 90 = 1195
    expect(section.totals.net).toBe(1195);
    expect(section.totals.regular_amount).toBe(800);
    expect(section.totals.daily_ot_amount).toBe(30);
    expect(section.totals.weekly_ot_amount).toBe(60);
    expect(section.totals.deductions_total).toBe(-10);
    expect(section.totals.statutory_total).toBe(-90);
  });

  it("builds multiple staff sections in stable id order", () => {
    const items: PayrollLineItem[] = [
      li({ id: "a", staff_id: "u2", kind: "hours", amount: 1000 }),
      li({ id: "b", staff_id: "u1", kind: "hours", amount: 800 }),
    ];
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: items,
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.staff.map((s) => s.staff_id)).toEqual(["u1", "u2"]);
  });

  it("subtracts negative deductions from net but never adds them to gross", () => {
    const items: PayrollLineItem[] = [
      li({ id: "1", staff_id: "u1", kind: "hours", amount: 1000 }),
      li({ id: "2", staff_id: "u1", kind: "deduction", amount: -250, source: "manual" }),
    ];
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: items,
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.staff[0].totals.gross).toBe(1000);
    expect(doc.staff[0].totals.net).toBe(750);
  });

  it("includes statutory deductions in net but not gross", () => {
    const items: PayrollLineItem[] = [
      li({ id: "1", staff_id: "u1", kind: "hours", amount: 1000 }),
      li({ id: "2", staff_id: "u1", kind: "statutory", amount: -200 }),
    ];
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: items,
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.staff[0].totals.gross).toBe(1000);
    expect(doc.staff[0].totals.statutory_total).toBe(-200);
    expect(doc.staff[0].totals.net).toBe(800);
  });

  it("uses round-of-sum for gross via independent unrounded accumulators", () => {
    // Three items at 0.025 each. With banker's-rounding sum-of-rounded
    // would yield round(0.02) + round(0.02) + round(0.02) = 0.06 (each
    // 0.025 rounds to 0.02 under banker's). round-of-sum yields
    // round(0.075) = 0.08 — also banker's rounding, but rounds 0.075 up
    // because the digit-before is odd.
    // We're not relying on banker's specifically — Math.round in JS uses
    // half-away-from-zero — but the assertion is that the transformer
    // sums first and rounds once, not the other way around.
    const items: PayrollLineItem[] = [
      li({ id: "1", staff_id: "u1", kind: "hours", amount: 0.025 }),
      li({ id: "2", staff_id: "u1", kind: "hours", amount: 0.025 }),
      li({ id: "3", staff_id: "u1", kind: "hours", amount: 0.025 }),
    ];
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: items,
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    // sum = 0.075. JS Math.round(0.075 * 100) = Math.round(7.5) = 8 → 0.08
    expect(doc.staff[0].totals.gross).toBe(0.08);
  });

  it("threads currency from settings rather than hardcoding", () => {
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: [],
      staff: STAFF,
      venueBranding: BRANDING,
      settings: { currency: "USD", timezone: "America/New_York" },
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.run.currency).toBe("USD");
  });

  it("threads timezone from settings", () => {
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: [],
      staff: STAFF,
      venueBranding: BRANDING,
      settings: { currency: "SGD", timezone: "Asia/Tokyo" },
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.run.timezone).toBe("Asia/Tokyo");
  });

  it("resolves locked_by into a name from the staff list", () => {
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: [],
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.run.locked_by_name).toBe("Olivia Owner");
  });

  it("falls back to 'Unknown' when locked_by points to a deleted staff", () => {
    const doc = buildPayslipDocument({
      run: { ...RUN, locked_by: "ghost-staff" },
      lineItems: [],
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.run.locked_by_name).toBe("Unknown");
  });

  it("falls back to 'Not yet locked' when locked_by is null", () => {
    const doc = buildPayslipDocument({
      run: { ...RUN, locked_at: null, locked_by: null, status: "draft" },
      lineItems: [],
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.run.locked_by_name).toBe("Not yet locked");
  });

  it("surfaces the multipliers field on each line item", () => {
    const items: PayrollLineItem[] = [
      li({
        id: "1",
        staff_id: "u1",
        kind: "overtime",
        amount: 60,
        hours: 2,
        rate_applied: 30,
        multipliers: { "ot:weekly_ot": 1.5, role_bartender: 1.1 },
      }),
    ];
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: items,
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.staff[0].line_items[0].multipliers).toEqual({
      "ot:weekly_ot": 1.5,
      role_bartender: 1.1,
    });
  });

  it("surfaces a sample clock_record_id for drill-down", () => {
    const items: PayrollLineItem[] = [
      li({
        id: "1",
        staff_id: "u1",
        kind: "hours",
        amount: 100,
        clock_record_id: "clock-7",
      }),
    ];
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: items,
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.staff[0].line_items[0].sample_clock_record_id).toBe("clock-7");
  });

  it("uses exportedAt when provided for stable test snapshots", () => {
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: [],
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: "2026-06-15T10:00:00.000Z",
    });
    expect(doc.metadata.exported_at).toBe("2026-06-15T10:00:00.000Z");
  });

  it("hardcodes format_version to '1.0'", () => {
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: [],
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.metadata.format_version).toBe("1.0");
  });

  it("populates venue branding fields verbatim", () => {
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: [],
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.venue).toEqual({
      name: "Tigress",
      address: "1 Cue St, Singapore",
      contact_email: "ops@tigress.test",
      contact_phone: "+65 0000 0000",
      logo_url: "",
    });
  });

  it("falls back to staff_id when full_name is not in the staff list", () => {
    const items: PayrollLineItem[] = [
      li({ id: "1", staff_id: "ghost", kind: "hours", amount: 100 }),
    ];
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: items,
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    expect(doc.staff[0].full_name).toBe("ghost");
  });
});

describe("filterPayslipToStaff", () => {
  it("returns only the named staff section", () => {
    const items: PayrollLineItem[] = [
      li({ id: "1", staff_id: "u1", kind: "hours", amount: 800 }),
      li({ id: "2", staff_id: "u2", kind: "hours", amount: 1000 }),
    ];
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: items,
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    const filtered = filterPayslipToStaff(doc, "u1");
    expect(filtered.staff).toHaveLength(1);
    expect(filtered.staff[0].staff_id).toBe("u1");
    // Other top-level fields are preserved.
    expect(filtered.run.id).toBe("run-1");
    expect(filtered.metadata.format_version).toBe("1.0");
  });

  it("returns empty staff array when filtering to a missing id", () => {
    const items: PayrollLineItem[] = [
      li({ id: "1", staff_id: "u1", kind: "hours", amount: 800 }),
    ];
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: items,
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: EXPORTER,
      exportedAt: EXPORTED_AT,
    });
    const filtered = filterPayslipToStaff(doc, "no-one");
    expect(filtered.staff).toEqual([]);
  });
});
