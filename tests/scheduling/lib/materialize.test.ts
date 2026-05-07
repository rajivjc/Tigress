import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  dayOfWeekFor,
  materializeFTAssignments,
  weekStartFor,
} from "@/scheduling/lib/materialize";
import type {
  FtAssignment,
  ShiftTemplate,
  TemplateDayCoverage,
} from "@/scheduling/types";

const FIXED_TS = "2025-01-01T00:00:00.000Z";

function tpl(id: string, opts: Partial<ShiftTemplate> = {}): ShiftTemplate {
  return {
    id,
    name: id.toUpperCase(),
    start_time: opts.start_time ?? "10:00:00",
    end_time: opts.end_time ?? "18:00:00",
    sort_order: opts.sort_order ?? 1,
    is_active: opts.is_active ?? true,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
  };
}

function dc(template_id: string, dow: number): TemplateDayCoverage {
  return {
    id: `c-${template_id}-${dow}`,
    template_id,
    day_of_week: dow,
    role_requirements: { bartender: 1 },
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
  };
}

function fa(opts: Partial<FtAssignment> & { user_id: string; day_of_week: number }): FtAssignment {
  return {
    id: opts.id ?? `fa-${Math.random().toString(36).slice(2, 6)}`,
    user_id: opts.user_id,
    template_id: opts.template_id ?? "am",
    day_of_week: opts.day_of_week,
    role: opts.role ?? "bartender",
    effective_from: opts.effective_from ?? "2024-01-01",
    effective_until: opts.effective_until ?? null,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
  };
}

const monday = "2026-05-04";

describe("addDaysIso", () => {
  it("adds days correctly across month boundaries", () => {
    expect(addDaysIso("2026-05-30", 5)).toBe("2026-06-04");
    expect(addDaysIso("2026-05-04", -1)).toBe("2026-05-03");
  });
});

describe("weekStartFor", () => {
  it("returns the Monday for any given date", () => {
    expect(weekStartFor("2026-05-04")).toBe("2026-05-04"); // Monday
    expect(weekStartFor("2026-05-05")).toBe("2026-05-04"); // Tuesday
    expect(weekStartFor("2026-05-10")).toBe("2026-05-04"); // Sunday
  });
});

describe("dayOfWeekFor", () => {
  it("Mon=0 .. Sun=6", () => {
    expect(dayOfWeekFor("2026-05-04")).toBe(0);
    expect(dayOfWeekFor("2026-05-08")).toBe(4);
    expect(dayOfWeekFor("2026-05-10")).toBe(6);
  });
});

describe("materializeFTAssignments", () => {
  const templates = [tpl("am"), tpl("pm", { start_time: "17:00:00", end_time: "23:00:00" })];
  const dayCoverage = [
    dc("am", 0),
    dc("am", 1),
    dc("am", 2),
    dc("am", 3),
    dc("am", 4),
    dc("pm", 0),
    dc("pm", 4),
  ];

  it("emits one shift per FT row that lands inside the week", () => {
    const ftAssignments = [
      fa({ user_id: "u1", day_of_week: 0 }),
      fa({ user_id: "u1", day_of_week: 4 }),
    ];
    const out = materializeFTAssignments({
      weekStartDate: monday,
      ftAssignments,
      templates,
      dayCoverage,
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      shift_date: "2026-05-04",
      template_id: "am",
      role: "bartender",
      user_id: "u1",
    });
    expect(out[1]).toMatchObject({ shift_date: "2026-05-08" });
  });

  it("respects effective_from (skips before window)", () => {
    const out = materializeFTAssignments({
      weekStartDate: monday,
      ftAssignments: [
        fa({
          user_id: "u1",
          day_of_week: 0,
          effective_from: "2026-05-05", // Tuesday, after monday
        }),
      ],
      templates,
      dayCoverage,
    });
    expect(out).toHaveLength(0);
  });

  it("respects effective_until (skips after window)", () => {
    const out = materializeFTAssignments({
      weekStartDate: monday,
      ftAssignments: [
        fa({
          user_id: "u1",
          day_of_week: 0,
          effective_until: "2026-05-03", // Sunday before
        }),
      ],
      templates,
      dayCoverage,
    });
    expect(out).toHaveLength(0);
  });

  it("includes shifts when effective_until is on the day or later", () => {
    const out = materializeFTAssignments({
      weekStartDate: monday,
      ftAssignments: [
        fa({
          user_id: "u1",
          day_of_week: 0,
          effective_until: "2026-05-04",
        }),
      ],
      templates,
      dayCoverage,
    });
    expect(out).toHaveLength(1);
  });

  it("skips assignments whose template isn't running that day", () => {
    // FT user assigned to AM on Saturday (dow=5) but AM has no coverage row
    // for Saturday in our fixture.
    const out = materializeFTAssignments({
      weekStartDate: monday,
      ftAssignments: [fa({ user_id: "u1", day_of_week: 5 })],
      templates,
      dayCoverage,
    });
    expect(out).toHaveLength(0);
  });

  it("skips assignments referencing inactive templates", () => {
    const out = materializeFTAssignments({
      weekStartDate: monday,
      ftAssignments: [fa({ user_id: "u1", day_of_week: 0 })],
      templates: [tpl("am", { is_active: false }), tpl("pm")],
      dayCoverage,
    });
    expect(out).toHaveLength(0);
  });

  it("skips assignments referencing missing templates", () => {
    const out = materializeFTAssignments({
      weekStartDate: monday,
      ftAssignments: [
        fa({ user_id: "u1", day_of_week: 0, template_id: "nonexistent" }),
      ],
      templates,
      dayCoverage,
    });
    expect(out).toHaveLength(0);
  });

  it("uses the template's start/end_time", () => {
    const out = materializeFTAssignments({
      weekStartDate: monday,
      ftAssignments: [
        fa({ user_id: "u1", day_of_week: 0, template_id: "pm" }),
      ],
      templates,
      dayCoverage,
    });
    expect(out[0]).toMatchObject({
      start_time: "17:00:00",
      end_time: "23:00:00",
    });
  });

  it("emits one row per (user, template, dow) — no merging", () => {
    const out = materializeFTAssignments({
      weekStartDate: monday,
      ftAssignments: [
        fa({ user_id: "u1", day_of_week: 0, template_id: "am" }),
        fa({ user_id: "u2", day_of_week: 0, template_id: "am" }),
      ],
      templates,
      dayCoverage,
    });
    expect(out).toHaveLength(2);
  });
});
