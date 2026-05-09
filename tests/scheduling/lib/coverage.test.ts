import { describe, expect, it } from "vitest";
import {
  dayOfWeekFromIso,
  validateWeekCoverage,
} from "@/scheduling/lib/coverage";
import type {
  ScheduleShift,
  TemplateDayCoverage,
} from "@/scheduling/types";

const FIXED_TS = "2025-01-01T00:00:00.000Z";

function shift(
  partial: Partial<ScheduleShift> & {
    template_id: string;
    shift_date: string;
    role: ScheduleShift["role"];
  }
): ScheduleShift {
  return {
    id: partial.id ?? `s-${Math.random().toString(36).slice(2, 8)}`,
    week_id: partial.week_id ?? "w-1",
    template_id: partial.template_id,
    shift_date: partial.shift_date,
    start_time: partial.start_time ?? "10:00:00",
    end_time: partial.end_time ?? "18:00:00",
    user_id: partial.user_id ?? null,
    role: partial.role,
    notes: null,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
  };
}

function coverage(
  templateId: string,
  dow: number,
  reqs: TemplateDayCoverage["role_requirements"]
): TemplateDayCoverage {
  return {
    id: `c-${templateId}-${dow}`,
    template_id: templateId,
    day_of_week: dow,
    role_requirements: reqs,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
  };
}

describe("dayOfWeekFromIso (Mon=0..Sun=6)", () => {
  it("returns 0 for a Monday", () => {
    // 2026-05-04 is a Monday
    expect(dayOfWeekFromIso("2026-05-04")).toBe(0);
  });
  it("returns 6 for a Sunday", () => {
    expect(dayOfWeekFromIso("2026-05-10")).toBe(6);
  });
  it("returns 4 for a Friday", () => {
    expect(dayOfWeekFromIso("2026-05-08")).toBe(4);
  });
});

describe("validateWeekCoverage", () => {
  const monday = "2026-05-04";

  it("returns ok=true and no gaps when nothing is required", () => {
    const report = validateWeekCoverage({ shifts: [], dayCoverage: [] });
    expect(report.ok).toBe(true);
    expect(report.gaps).toHaveLength(0);
  });

  it("flags a wholly-empty required slot as a gap", () => {
    const dc = [coverage("am", 0, { bartender: 1, floor: 1 })];
    // A scaffolded but unfilled shift on the AM template Monday.
    const shifts = [
      shift({
        template_id: "am",
        shift_date: monday,
        role: "bartender",
        user_id: null,
      }),
    ];
    const report = validateWeekCoverage({ shifts, dayCoverage: dc });
    expect(report.ok).toBe(false);
    expect(report.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "bartender", required: 1, assigned: 0 }),
        expect.objectContaining({ role: "floor", required: 1, assigned: 0 }),
      ])
    );
  });

  it("counts assigned shifts toward coverage", () => {
    const dc = [coverage("am", 0, { bartender: 1, floor: 1 })];
    const shifts = [
      shift({
        template_id: "am",
        shift_date: monday,
        role: "bartender",
        user_id: "u1",
      }),
      shift({
        template_id: "am",
        shift_date: monday,
        role: "floor",
        user_id: "u2",
      }),
    ];
    const report = validateWeekCoverage({ shifts, dayCoverage: dc });
    expect(report.ok).toBe(true);
    expect(report.gaps).toHaveLength(0);
  });

  it("partial coverage produces precise gap counts", () => {
    const dc = [coverage("pm", 4, { bartender: 2, floor: 1, mod: 1 })];
    const friday = "2026-05-08";
    const shifts = [
      shift({
        template_id: "pm",
        shift_date: friday,
        role: "bartender",
        user_id: "u1",
      }),
      shift({
        template_id: "pm",
        shift_date: friday,
        role: "mod",
        user_id: "u2",
      }),
    ];
    const report = validateWeekCoverage({ shifts, dayCoverage: dc });
    expect(report.ok).toBe(false);
    const bartenderGap = report.gaps.find((g) => g.role === "bartender");
    expect(bartenderGap).toMatchObject({ required: 2, assigned: 1 });
    const floorGap = report.gaps.find((g) => g.role === "floor");
    expect(floorGap).toMatchObject({ required: 1, assigned: 0 });
  });

  it("ignores extras over the requirement (over-staffing is fine)", () => {
    const dc = [coverage("am", 0, { bartender: 1 })];
    const shifts = [
      shift({
        template_id: "am",
        shift_date: monday,
        role: "bartender",
        user_id: "u1",
      }),
      shift({
        template_id: "am",
        shift_date: monday,
        role: "bartender",
        user_id: "u2",
      }),
    ];
    const report = validateWeekCoverage({ shifts, dayCoverage: dc });
    expect(report.ok).toBe(true);
    expect(report.gaps).toHaveLength(0);
  });

  it("treats unfilled (user_id=null) as not assigned", () => {
    const dc = [coverage("am", 0, { mod: 1 })];
    const shifts = [
      shift({
        template_id: "am",
        shift_date: monday,
        role: "mod",
        user_id: null,
      }),
    ];
    const report = validateWeekCoverage({ shifts, dayCoverage: dc });
    expect(report.ok).toBe(false);
    expect(report.gaps[0]).toMatchObject({
      role: "mod",
      required: 1,
      assigned: 0,
    });
  });

  it("per-shift report flags unfilled roles within the same group", () => {
    const dc = [coverage("am", 0, { bartender: 1, floor: 1 })];
    const shifts = [
      shift({
        id: "s-bar",
        template_id: "am",
        shift_date: monday,
        role: "bartender",
        user_id: "u1",
      }),
      shift({
        id: "s-floor",
        template_id: "am",
        shift_date: monday,
        role: "floor",
        user_id: null,
      }),
    ];
    const report = validateWeekCoverage({ shifts, dayCoverage: dc });
    const reports = new Map(report.per_shift.map((p) => [p.shift_id, p]));
    expect(reports.get("s-bar")?.unfilled_roles).toContain("floor");
    expect(reports.get("s-floor")?.unfilled_roles).toContain("floor");
  });

  // ----- S26 fix-up coverage of S25 audit findings -----

  it("over-staffed templates report ok with zero gaps", () => {
    const monday = "2026-05-04";
    const dc = [coverage("pm", 0, { bartender: 1 })];
    const shifts = [
      shift({ id: "a", template_id: "pm", shift_date: monday, role: "bartender", user_id: "u1" }),
      shift({ id: "b", template_id: "pm", shift_date: monday, role: "bartender", user_id: "u2" }),
    ];
    const r = validateWeekCoverage({ shifts, dayCoverage: dc });
    expect(r.ok).toBe(true);
    expect(r.gaps).toEqual([]);
  });

  it("a shift assigned with the wrong role does not fill the requirement", () => {
    const monday = "2026-05-04";
    const dc = [coverage("pm", 0, { mod: 1 })];
    const shifts = [
      shift({ id: "wrong", template_id: "pm", shift_date: monday, role: "bartender", user_id: "u1" }),
    ];
    const r = validateWeekCoverage({ shifts, dayCoverage: dc });
    expect(r.ok).toBe(false);
    expect(r.gaps.find((g) => g.role === "mod")).toBeDefined();
  });

  it("MOD requirement on a multi-role shift surfaces as a separate gap", () => {
    const monday = "2026-05-04";
    const dc = [coverage("pm", 0, { bartender: 1, mod: 1, floor: 1 })];
    const shifts = [
      shift({ id: "a", template_id: "pm", shift_date: monday, role: "bartender", user_id: "u1" }),
      shift({ id: "b", template_id: "pm", shift_date: monday, role: "floor", user_id: "u2" }),
    ];
    const r = validateWeekCoverage({ shifts, dayCoverage: dc });
    expect(r.ok).toBe(false);
    expect(r.gaps.map((g) => g.role)).toContain("mod");
  });

  it("multi-shift-per-day weeks compute coverage per (date, template) independently", () => {
    const monday = "2026-05-04";
    const dc = [
      coverage("am", 0, { bartender: 1 }),
      coverage("pm", 0, { bartender: 1 }),
    ];
    const shifts = [
      shift({ id: "am-1", template_id: "am", shift_date: monday, role: "bartender", user_id: "u1" }),
      shift({ id: "pm-1", template_id: "pm", shift_date: monday, role: "bartender", user_id: null }),
    ];
    const r = validateWeekCoverage({ shifts, dayCoverage: dc });
    expect(r.gaps.length).toBe(1);
    expect(r.gaps[0].template_id).toBe("pm");
  });
});
