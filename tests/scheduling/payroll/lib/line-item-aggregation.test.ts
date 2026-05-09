import { describe, expect, it } from "vitest";
import {
  buildLineItems,
  flatResolvedRates,
} from "@/scheduling/payroll/lib/line-item-aggregation";
import type { ClassifiedHours } from "@/scheduling/payroll/lib/overtime-classification";
import type { PayrollSettings } from "@/scheduling/payroll/types";

const FIXED_TS = "2025-01-01T00:00:00.000Z";

const SETTINGS: PayrollSettings = {
  id: "s1",
  pay_frequency: "monthly",
  payment_offset_days: 7,
  default_export_format: "csv",
  statutory_deduction_pct: 0,
  currency: "SGD",
  created_at: FIXED_TS,
  updated_at: FIXED_TS,
};

function ch(partial: Partial<ClassifiedHours> & { recordId: string; staffId: string; kind: ClassifiedHours["kind"]; hours: number; multiplier: number }): ClassifiedHours {
  return {
    recordId: partial.recordId,
    staffId: partial.staffId,
    date: partial.date ?? "2026-05-04",
    kind: partial.kind,
    hours: partial.hours,
    multiplier: partial.multiplier,
  };
}

describe("buildLineItems", () => {
  it("returns no items when classifiedHours is empty", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [],
      resolvedRates: new Map(),
      settings: SETTINGS,
      baseRates: new Map(),
    });
    expect(items).toEqual([]);
  });

  it("aggregates regular hours into one engine item per staff", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r1", staffId: "u1", kind: "regular", hours: 8, multiplier: 1 }),
        ch({ recordId: "r2", staffId: "u1", kind: "regular", hours: 4, multiplier: 1 }),
      ],
      resolvedRates: new Map(),
      settings: SETTINGS,
      baseRates: new Map([["u1", 20]]),
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "hours",
      hours: 12,
      amount: 240,
      source: "engine",
    });
  });

  it("creates separate items per (staff, kind)", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r1", staffId: "u1", kind: "regular", hours: 40, multiplier: 1 }),
        ch({ recordId: "r2", staffId: "u1", kind: "weekly_ot", hours: 5, multiplier: 1.5 }),
      ],
      resolvedRates: new Map(),
      settings: SETTINGS,
      baseRates: new Map([["u1", 20]]),
    });
    expect(items.map((i) => i.kind).sort()).toEqual(["hours", "overtime"]);
    const ot = items.find((i) => i.kind === "overtime");
    expect(ot?.amount).toBe(150); // 5 × 20 × 1.5
  });

  it("rest_day produces a 'rest_day' line item", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r1", staffId: "u1", kind: "rest_day", hours: 6, multiplier: 2 }),
      ],
      resolvedRates: new Map(),
      settings: SETTINGS,
      baseRates: new Map([["u1", 20]]),
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("rest_day");
    expect(items[0].amount).toBe(240);
  });

  it("public_holiday produces a 'public_holiday' line item", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r1", staffId: "u1", kind: "public_holiday", hours: 8, multiplier: 2 }),
      ],
      resolvedRates: new Map(),
      settings: SETTINGS,
      baseRates: new Map([["u1", 25]]),
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("public_holiday");
    expect(items[0].amount).toBe(400); // 25 × 8 × 2
  });

  it("daily_ot and weekly_ot both map to 'overtime' kind and DON'T merge", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r1", staffId: "u1", kind: "daily_ot", hours: 2, multiplier: 1.5 }),
        ch({ recordId: "r2", staffId: "u1", kind: "weekly_ot", hours: 3, multiplier: 1.5 }),
      ],
      resolvedRates: new Map(),
      settings: SETTINGS,
      baseRates: new Map([["u1", 20]]),
    });
    // Same staff, same line-item kind 'overtime' but different ClassificationKinds
    // yields two distinct buckets.
    const otItems = items.filter((i) => i.kind === "overtime");
    expect(otItems).toHaveLength(2);
  });

  it("respects resolved-rate multipliers from rate-resolution lib", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r1", staffId: "u1", kind: "regular", hours: 8, multiplier: 1 }),
      ],
      resolvedRates: flatResolvedRates(
        new Map([
          [
            "u1",
            { staffId: "u1", effectiveRate: 30, multipliersApplied: { "role:mod": 1.5 } },
          ],
        ]),
        ["regular"]
      ),
      settings: SETTINGS,
      baseRates: new Map([["u1", 20]]),
    });
    expect(items[0].amount).toBe(240); // 30 × 8
    expect(items[0].rate_applied).toBe(30);
    expect(items[0].multipliers).toMatchObject({ "role:mod": 1.5 });
  });

  it("statutory deduction line item appended when pct > 0", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r1", staffId: "u1", kind: "regular", hours: 10, multiplier: 1 }),
      ],
      resolvedRates: new Map(),
      settings: { ...SETTINGS, statutory_deduction_pct: 20 },
      baseRates: new Map([["u1", 10]]),
    });
    const statutory = items.find((i) => i.kind === "statutory");
    expect(statutory).toBeDefined();
    expect(statutory!.amount).toBe(-20); // -20% of 100
    expect(statutory!.source).toBe("engine");
  });

  it("statutory deduction skipped when pct = 0", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r1", staffId: "u1", kind: "regular", hours: 10, multiplier: 1 }),
      ],
      resolvedRates: new Map(),
      settings: SETTINGS,
      baseRates: new Map([["u1", 10]]),
    });
    expect(items.find((i) => i.kind === "statutory")).toBeUndefined();
  });

  it("multiple staff each get their own engine items", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r1", staffId: "u1", kind: "regular", hours: 10, multiplier: 1 }),
        ch({ recordId: "r2", staffId: "u2", kind: "regular", hours: 8, multiplier: 1 }),
      ],
      resolvedRates: new Map(),
      settings: SETTINGS,
      baseRates: new Map([["u1", 20], ["u2", 25]]),
    });
    const u1 = items.filter((i) => i.staff_id === "u1");
    const u2 = items.filter((i) => i.staff_id === "u2");
    expect(u1).toHaveLength(1);
    expect(u2).toHaveLength(1);
    expect(u1[0].amount).toBe(200);
    expect(u2[0].amount).toBe(200);
  });

  it("output is deterministic given the same input", () => {
    const input = {
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r1", staffId: "u1", kind: "regular", hours: 8, multiplier: 1 }),
        ch({ recordId: "r2", staffId: "u2", kind: "regular", hours: 8, multiplier: 1 }),
      ],
      resolvedRates: new Map(),
      settings: SETTINGS,
      baseRates: new Map([["u1", 20], ["u2", 25]]),
    };
    const a = buildLineItems(input);
    const b = buildLineItems(input);
    expect(a).toEqual(b);
  });

  it("amounts round to 2 decimal places", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r1", staffId: "u1", kind: "regular", hours: 7.333, multiplier: 1 }),
      ],
      resolvedRates: new Map(),
      settings: SETTINGS,
      baseRates: new Map([["u1", 13.137]]),
    });
    // 7.333 × 13.137 ≈ 96.330... → rounds to 96.33
    expect(items[0].amount).toBe(96.33);
  });

  it("falls back to 0 when no rate available for a staff", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r1", staffId: "u1", kind: "regular", hours: 8, multiplier: 1 }),
      ],
      resolvedRates: new Map(),
      settings: SETTINGS,
      baseRates: new Map(), // no rate
    });
    expect(items[0].amount).toBe(0);
  });

  it("each engine item carries a sample clock_record_id for drill-down", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r-sample", staffId: "u1", kind: "regular", hours: 8, multiplier: 1 }),
      ],
      resolvedRates: new Map(),
      settings: SETTINGS,
      baseRates: new Map([["u1", 20]]),
    });
    expect(items[0].clock_record_id).toBe("r-sample");
  });

  it("aggregated items track ot multiplier in multipliers map", () => {
    const items = buildLineItems({
      runId: "run1",
      classifiedHours: [
        ch({ recordId: "r1", staffId: "u1", kind: "weekly_ot", hours: 4, multiplier: 1.5 }),
      ],
      resolvedRates: new Map(),
      settings: SETTINGS,
      baseRates: new Map([["u1", 20]]),
    });
    expect(items[0].multipliers).toMatchObject({ "ot:weekly_ot": 1.5 });
  });
});
