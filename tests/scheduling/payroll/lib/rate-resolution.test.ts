import { describe, expect, it } from "vitest";
import { resolveRateForShift } from "@/scheduling/payroll/lib/rate-resolution";
import type { PayrollRateRule } from "@/scheduling/payroll/types";

const FIXED_TS = "2025-01-01T00:00:00.000Z";

function rule(partial: Partial<PayrollRateRule> & { kind: PayrollRateRule["kind"]; match_value: string; multiplier: number }): PayrollRateRule {
  return {
    id: partial.id ?? `r-${Math.random().toString(36).slice(2, 10)}`,
    kind: partial.kind,
    match_value: partial.match_value,
    window_start: partial.window_start ?? null,
    window_end: partial.window_end ?? null,
    multiplier: partial.multiplier,
    priority: partial.priority ?? 100,
    is_active: partial.is_active ?? true,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
  };
}

describe("resolveRateForShift", () => {
  it("returns base rate when no rules are configured", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "bartender",
      shiftStartTime: "10:00:00",
      shiftEndTime: "18:00:00",
      rules: [],
    });
    expect(r.effectiveRate).toBe(20);
    expect(r.multipliersApplied).toEqual({});
  });

  it("returns base rate when no rules match the role", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "bartender",
      shiftStartTime: "10:00:00",
      shiftEndTime: "18:00:00",
      rules: [rule({ kind: "role", match_value: "mod", multiplier: 1.5 })],
    });
    expect(r.effectiveRate).toBe(20);
  });

  it("applies a role multiplier", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "mod",
      shiftStartTime: "10:00:00",
      shiftEndTime: "18:00:00",
      rules: [rule({ kind: "role", match_value: "mod", multiplier: 1.25 })],
    });
    expect(r.effectiveRate).toBe(25);
    expect(r.multipliersApplied).toEqual({ "role:mod": 1.25 });
  });

  it("ignores inactive rules", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "mod",
      shiftStartTime: "10:00:00",
      shiftEndTime: "18:00:00",
      rules: [
        rule({ kind: "role", match_value: "mod", multiplier: 1.5, is_active: false }),
      ],
    });
    expect(r.effectiveRate).toBe(20);
    expect(r.multipliersApplied).toEqual({});
  });

  it("applies a time-of-day multiplier when the shift overlaps the window", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "bartender",
      shiftStartTime: "22:00:00",
      shiftEndTime: "23:30:00",
      rules: [
        rule({
          kind: "time_of_day",
          match_value: "after_10pm",
          window_start: "22:00:00",
          window_end: "23:59:00",
          multiplier: 1.2,
        }),
      ],
    });
    expect(r.effectiveRate).toBe(24);
    expect(r.multipliersApplied).toEqual({ "time_of_day:after_10pm": 1.2 });
  });

  it("does not apply a time-of-day multiplier when the shift doesn't overlap", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "bartender",
      shiftStartTime: "10:00:00",
      shiftEndTime: "18:00:00",
      rules: [
        rule({
          kind: "time_of_day",
          match_value: "graveyard",
          window_start: "00:00:00",
          window_end: "06:00:00",
          multiplier: 1.5,
        }),
      ],
    });
    expect(r.effectiveRate).toBe(20);
  });

  it("composes role + time-of-day multiplicatively", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "mod",
      shiftStartTime: "22:00:00",
      shiftEndTime: "23:30:00",
      rules: [
        rule({ kind: "role", match_value: "mod", multiplier: 1.25 }),
        rule({
          kind: "time_of_day",
          match_value: "late",
          window_start: "22:00:00",
          window_end: "23:59:00",
          multiplier: 1.2,
        }),
      ],
    });
    // 20 × 1.25 × 1.2 = 30
    expect(r.effectiveRate).toBe(30);
  });

  it("supports time-of-day windows wrapping past midnight", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "bartender",
      shiftStartTime: "23:00:00",
      shiftEndTime: "23:30:00",
      rules: [
        rule({
          kind: "time_of_day",
          match_value: "graveyard",
          window_start: "22:00:00",
          window_end: "06:00:00",
          multiplier: 1.5,
        }),
      ],
    });
    expect(r.effectiveRate).toBe(30);
  });

  it("applies window when the shift starts after midnight inside a wrap window", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "bartender",
      shiftStartTime: "01:00:00",
      shiftEndTime: "05:00:00",
      rules: [
        rule({
          kind: "time_of_day",
          match_value: "graveyard",
          window_start: "22:00:00",
          window_end: "06:00:00",
          multiplier: 1.5,
        }),
      ],
    });
    expect(r.effectiveRate).toBe(30);
  });

  it("highest priority (lowest priority value) time-of-day wins on overlap", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "bartender",
      shiftStartTime: "22:00:00",
      shiftEndTime: "23:00:00",
      rules: [
        rule({
          kind: "time_of_day",
          match_value: "low_priority",
          window_start: "22:00:00",
          window_end: "23:59:00",
          multiplier: 2.0,
          priority: 200,
        }),
        rule({
          kind: "time_of_day",
          match_value: "high_priority",
          window_start: "22:00:00",
          window_end: "23:59:00",
          multiplier: 1.5,
          priority: 50,
        }),
      ],
    });
    expect(r.effectiveRate).toBe(30); // 20 × 1.5
    expect(r.multipliersApplied).toEqual({ "time_of_day:high_priority": 1.5 });
  });

  it("missing role multiplier returns base × 1.0 with empty map", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "floor",
      shiftStartTime: "10:00:00",
      shiftEndTime: "18:00:00",
      rules: [rule({ kind: "role", match_value: "mod", multiplier: 1.5 })],
    });
    expect(r.effectiveRate).toBe(20);
    expect(r.multipliersApplied).toEqual({});
  });

  it("only one role multiplier applies even if multiple match value (lowest priority wins)", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "mod",
      shiftStartTime: "10:00:00",
      shiftEndTime: "18:00:00",
      rules: [
        rule({ kind: "role", match_value: "mod", multiplier: 2.0, priority: 200 }),
        rule({ kind: "role", match_value: "mod", multiplier: 1.5, priority: 50 }),
      ],
    });
    expect(r.effectiveRate).toBe(30);
  });

  it("two non-overlapping time-of-day rules both apply when shift hits both", () => {
    const r = resolveRateForShift({
      baseRate: 10,
      role: "bartender",
      shiftStartTime: "05:00:00",
      shiftEndTime: "23:00:00",
      rules: [
        rule({
          kind: "time_of_day",
          match_value: "early",
          window_start: "00:00:00",
          window_end: "06:00:00",
          multiplier: 1.5,
        }),
        rule({
          kind: "time_of_day",
          match_value: "late",
          window_start: "22:00:00",
          window_end: "23:59:00",
          multiplier: 1.2,
        }),
      ],
    });
    // Both apply: 10 × 1.5 × 1.2 = 18
    expect(r.effectiveRate).toBeCloseTo(18, 5);
  });

  it("base rate of 0 stays 0 regardless of multipliers", () => {
    const r = resolveRateForShift({
      baseRate: 0,
      role: "mod",
      shiftStartTime: "10:00:00",
      shiftEndTime: "18:00:00",
      rules: [rule({ kind: "role", match_value: "mod", multiplier: 5 })],
    });
    expect(r.effectiveRate).toBe(0);
  });

  it("inactive role rule with active TOD rule applies only the TOD", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "mod",
      shiftStartTime: "22:00:00",
      shiftEndTime: "23:00:00",
      rules: [
        rule({ kind: "role", match_value: "mod", multiplier: 2, is_active: false }),
        rule({
          kind: "time_of_day",
          match_value: "late",
          window_start: "22:00:00",
          window_end: "23:59:00",
          multiplier: 1.5,
        }),
      ],
    });
    expect(r.effectiveRate).toBe(30);
    expect(r.multipliersApplied).toEqual({ "time_of_day:late": 1.5 });
  });

  it("zero-length shift (start === end) gets no time-of-day multiplier", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "bartender",
      shiftStartTime: "22:00:00",
      shiftEndTime: "22:00:00",
      rules: [
        rule({
          kind: "time_of_day",
          match_value: "late",
          window_start: "22:00:00",
          window_end: "23:59:00",
          multiplier: 1.5,
        }),
      ],
    });
    expect(r.effectiveRate).toBe(20);
  });

  it("a TOD rule with the same priority as another applies deterministically by id", () => {
    const r = resolveRateForShift({
      baseRate: 10,
      role: "bartender",
      shiftStartTime: "22:00:00",
      shiftEndTime: "23:00:00",
      rules: [
        rule({
          id: "z-id",
          kind: "time_of_day",
          match_value: "late_z",
          window_start: "22:00:00",
          window_end: "23:59:00",
          multiplier: 1.2,
          priority: 100,
        }),
        rule({
          id: "a-id",
          kind: "time_of_day",
          match_value: "late_a",
          window_start: "22:00:00",
          window_end: "23:59:00",
          multiplier: 1.5,
          priority: 100,
        }),
      ],
    });
    // a-id sorts first, so its multiplier wins when overlapping.
    expect(r.effectiveRate).toBe(15);
    expect(r.multipliersApplied).toEqual({ "time_of_day:late_a": 1.5 });
  });

  it("midnight-spanning shift applies wrapping TOD across the boundary", () => {
    const r = resolveRateForShift({
      baseRate: 10,
      role: "bartender",
      shiftStartTime: "22:00:00",
      shiftEndTime: "02:00:00", // wraps
      rules: [
        rule({
          kind: "time_of_day",
          match_value: "graveyard",
          window_start: "22:00:00",
          window_end: "06:00:00",
          multiplier: 1.5,
        }),
      ],
    });
    expect(r.effectiveRate).toBe(15);
  });

  it("role + time-of-day where shift fully sits outside window applies role only", () => {
    const r = resolveRateForShift({
      baseRate: 10,
      role: "mod",
      shiftStartTime: "10:00:00",
      shiftEndTime: "16:00:00",
      rules: [
        rule({ kind: "role", match_value: "mod", multiplier: 1.5 }),
        rule({
          kind: "time_of_day",
          match_value: "late",
          window_start: "22:00:00",
          window_end: "23:59:00",
          multiplier: 2,
        }),
      ],
    });
    expect(r.effectiveRate).toBe(15);
    expect(r.multipliersApplied).toEqual({ "role:mod": 1.5 });
  });

  it("no time-of-day applies when window fields are missing", () => {
    const r = resolveRateForShift({
      baseRate: 20,
      role: "mod",
      shiftStartTime: "22:00:00",
      shiftEndTime: "23:00:00",
      rules: [
        rule({ kind: "time_of_day", match_value: "broken", multiplier: 1.5 }),
      ],
    });
    expect(r.effectiveRate).toBe(20);
  });

  it("composing role + two non-overlapping TOD rules stacks all three", () => {
    const r = resolveRateForShift({
      baseRate: 10,
      role: "mod",
      shiftStartTime: "05:00:00",
      shiftEndTime: "23:00:00",
      rules: [
        rule({ kind: "role", match_value: "mod", multiplier: 2 }),
        rule({
          kind: "time_of_day",
          match_value: "early",
          window_start: "00:00:00",
          window_end: "06:00:00",
          multiplier: 1.5,
        }),
        rule({
          kind: "time_of_day",
          match_value: "late",
          window_start: "22:00:00",
          window_end: "23:59:00",
          multiplier: 1.2,
        }),
      ],
    });
    // 10 × 2 × 1.5 × 1.2 = 36
    expect(r.effectiveRate).toBeCloseTo(36, 5);
  });
});
