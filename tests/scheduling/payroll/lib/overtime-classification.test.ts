import { describe, expect, it } from "vitest";
import {
  classifyHoursForPeriod,
  defaultRestDayResolver,
} from "@/scheduling/payroll/lib/overtime-classification";
import type {
  PayrollHoliday,
  PayrollOvertimeRules,
} from "@/scheduling/payroll/types";
import type { ClockRecord } from "@/scheduling/types";

const FIXED_TS = "2025-01-01T00:00:00.000Z";

function record(partial: Partial<ClockRecord> & { id: string; user_id: string; clocked_in_at: string; clocked_out_at: string }): ClockRecord {
  return {
    id: partial.id,
    shift_id: partial.shift_id ?? `s-${partial.id}`,
    user_id: partial.user_id,
    clocked_in_at: partial.clocked_in_at,
    clocked_out_at: partial.clocked_out_at,
    status: partial.status ?? "locked",
    locked_at: partial.locked_at ?? FIXED_TS,
    locked_by: partial.locked_by ?? null,
    unlock_note: null,
    manager_edited: false,
    manager_edit_note: null,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
  };
}

const SG_DEFAULT_RULES: PayrollOvertimeRules = {
  id: "ot-rules-1",
  weekly_threshold_hours: 44,
  weekly_ot_multiplier: 1.5,
  daily_threshold_hours: null,
  daily_ot_multiplier: 1.5,
  rest_day_multiplier: 2.0,
  public_holiday_multiplier: 2.0,
  rest_day_strategy: "sunday",
  created_at: FIXED_TS,
  updated_at: FIXED_TS,
};

const NEVER_REST: () => boolean = () => false;

describe("classifyHoursForPeriod", () => {
  it("classifies a simple 8-hour shift as regular", () => {
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-04T10:00:00Z",
          clocked_out_at: "2026-05-04T18:00:00Z",
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "regular", hours: 8, multiplier: 1.0 });
  });

  it("PH wins over rest day", () => {
    const ph: PayrollHoliday[] = [
      { date: "2026-05-04", name: "Test", is_active: true, created_at: FIXED_TS },
    ];
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-04T10:00:00Z",
          clocked_out_at: "2026-05-04T18:00:00Z",
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: ph,
      restDayResolver: () => true, // would be rest day
    });
    expect(out[0].kind).toBe("public_holiday");
    expect(out[0].multiplier).toBe(2.0);
  });

  it("rest day classified when resolver returns true (and not PH)", () => {
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-04T10:00:00Z",
          clocked_out_at: "2026-05-04T18:00:00Z",
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: () => true,
    });
    expect(out[0].kind).toBe("rest_day");
    expect(out[0].multiplier).toBe(2.0);
  });

  it("default Sunday rest-day resolver flags Sunday work", () => {
    // 2026-05-10 is a Sunday.
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-10T10:00:00Z",
          clocked_out_at: "2026-05-10T16:00:00Z",
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: defaultRestDayResolver(SG_DEFAULT_RULES),
    });
    expect(out[0].kind).toBe("rest_day");
  });

  it("default Sunday rest-day resolver does NOT flag a Tuesday", () => {
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-05T10:00:00Z",
          clocked_out_at: "2026-05-05T16:00:00Z",
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: defaultRestDayResolver(SG_DEFAULT_RULES),
    });
    expect(out[0].kind).toBe("regular");
  });

  it("weekly OT kicks in past 44h threshold", () => {
    // Five 9h days = 45h. The 45th hour is weekly OT.
    const records: ClockRecord[] = [];
    for (let day = 0; day < 5; day++) {
      const date = new Date(Date.UTC(2026, 4, 4 + day));
      const start = `${date.toISOString().slice(0, 10)}T10:00:00Z`;
      const end = `${date.toISOString().slice(0, 10)}T19:00:00Z`;
      records.push(
        record({
          id: `r${day}`,
          user_id: "u1",
          clocked_in_at: start,
          clocked_out_at: end,
        })
      );
    }
    const out = classifyHoursForPeriod({
      clockRecords: records,
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    const totalRegular = out
      .filter((c) => c.kind === "regular")
      .reduce((s, c) => s + c.hours, 0);
    const totalWeeklyOt = out
      .filter((c) => c.kind === "weekly_ot")
      .reduce((s, c) => s + c.hours, 0);
    expect(totalRegular).toBe(44);
    expect(totalWeeklyOt).toBe(1);
  });

  it("daily threshold disabled means no daily_ot ever produced", () => {
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-04T08:00:00Z",
          clocked_out_at: "2026-05-04T22:00:00Z", // 14h
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES, // daily disabled
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    expect(out.find((c) => c.kind === "daily_ot")).toBeUndefined();
  });

  it("daily OT kicks in past 8h when configured", () => {
    const rules = { ...SG_DEFAULT_RULES, daily_threshold_hours: 8 };
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-04T08:00:00Z",
          clocked_out_at: "2026-05-04T18:00:00Z", // 10h
        }),
      ],
      overtimeRules: rules,
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    const reg = out.find((c) => c.kind === "regular");
    const dailyOt = out.find((c) => c.kind === "daily_ot");
    expect(reg?.hours).toBe(8);
    expect(dailyOt?.hours).toBe(2);
  });

  it("weekly threshold disabled means everything > weekly limit just stays regular if under daily", () => {
    const rules = {
      ...SG_DEFAULT_RULES,
      weekly_threshold_hours: null,
      daily_threshold_hours: null,
    };
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-04T08:00:00Z",
          clocked_out_at: "2026-05-04T20:00:00Z", // 12h
        }),
      ],
      overtimeRules: rules,
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("regular");
    expect(out[0].hours).toBe(12);
  });

  it("both daily and weekly thresholds active — daily OT first, then weekly", () => {
    const rules = {
      ...SG_DEFAULT_RULES,
      daily_threshold_hours: 8,
      weekly_threshold_hours: 40,
    };
    const records: ClockRecord[] = [];
    // 5 × 9h = 45h. Daily OT each day = 1h × 5 = 5h; rest split into regular and weekly-ot per running totals.
    for (let day = 0; day < 5; day++) {
      const date = new Date(Date.UTC(2026, 4, 4 + day))
        .toISOString()
        .slice(0, 10);
      records.push(
        record({
          id: `r${day}`,
          user_id: "u1",
          clocked_in_at: `${date}T10:00:00Z`,
          clocked_out_at: `${date}T19:00:00Z`,
        })
      );
    }
    const out = classifyHoursForPeriod({
      clockRecords: records,
      overtimeRules: rules,
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    const reg = out.filter((c) => c.kind === "regular").reduce((s, c) => s + c.hours, 0);
    const daily = out.filter((c) => c.kind === "daily_ot").reduce((s, c) => s + c.hours, 0);
    const weekly = out.filter((c) => c.kind === "weekly_ot").reduce((s, c) => s + c.hours, 0);
    expect(reg + daily + weekly).toBe(45);
    // First 40 hours are regular (split across days, including the 8h daily portions),
    // anything above daily threshold AND not yet over weekly is daily_ot,
    // remainder past 40h overall is weekly_ot.
    expect(daily).toBeGreaterThan(0);
    expect(weekly).toBeGreaterThan(0);
  });

  it("classifies records of zero duration as no output", () => {
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-04T10:00:00Z",
          clocked_out_at: "2026-05-04T10:00:00Z",
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    expect(out).toEqual([]);
  });

  it("skips records with no clocked_out_at (still active)", () => {
    const records: ClockRecord[] = [
      {
        ...record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-04T10:00:00Z",
          clocked_out_at: "2026-05-04T18:00:00Z",
        }),
      },
      // active, no clock-out
      {
        id: "r2",
        shift_id: "s-r2",
        user_id: "u1",
        clocked_in_at: "2026-05-05T10:00:00Z",
        clocked_out_at: null,
        status: "active",
        locked_at: null,
        locked_by: null,
        unlock_note: null,
        manager_edited: false,
        manager_edit_note: null,
        created_at: FIXED_TS,
        updated_at: FIXED_TS,
      },
    ];
    const out = classifyHoursForPeriod({
      clockRecords: records,
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    expect(out).toHaveLength(1);
    expect(out[0].recordId).toBe("r1");
  });

  it("partial-week records straddling Monday belong to the week of clock-in", () => {
    // Sunday 2026-05-10 8h → still in previous ISO week (Mon 2026-05-04).
    // Monday 2026-05-11 8h → new week.
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-10T10:00:00Z",
          clocked_out_at: "2026-05-10T18:00:00Z",
        }),
        record({
          id: "r2",
          user_id: "u1",
          clocked_in_at: "2026-05-11T10:00:00Z",
          clocked_out_at: "2026-05-11T18:00:00Z",
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: NEVER_REST, // skip the Sunday-rest case
    });
    // Each is 8h, well under 44h → both regular.
    expect(out.every((c) => c.kind === "regular")).toBe(true);
  });

  it("each clock-record-hour goes into exactly one bucket", () => {
    const records: ClockRecord[] = [];
    for (let day = 0; day < 6; day++) {
      const d = new Date(Date.UTC(2026, 4, 4 + day))
        .toISOString()
        .slice(0, 10);
      records.push(
        record({
          id: `r${day}`,
          user_id: "u1",
          clocked_in_at: `${d}T10:00:00Z`,
          clocked_out_at: `${d}T18:00:00Z`,
        })
      );
    }
    const out = classifyHoursForPeriod({
      clockRecords: records,
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    const total = out.reduce((s, c) => s + c.hours, 0);
    expect(total).toBe(48);
  });

  it("active and pending_review records are still skipped if clocked_out_at null", () => {
    // Records can have status pending_review yet still have clock-out (which we want to keep).
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-04T10:00:00Z",
          clocked_out_at: "2026-05-04T18:00:00Z",
          status: "pending_review",
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    // Should still be classified — only null clocked_out_at is skipped.
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("regular");
  });

  it("inactive holiday rows do not flip a record to public_holiday", () => {
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-04T10:00:00Z",
          clocked_out_at: "2026-05-04T18:00:00Z",
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [
        { date: "2026-05-04", name: "Inactive PH", is_active: false, created_at: FIXED_TS },
      ],
      restDayResolver: NEVER_REST,
    });
    expect(out[0].kind).toBe("regular");
  });

  it("two staff with overlapping hours track running totals independently", () => {
    const records: ClockRecord[] = [];
    for (let day = 0; day < 5; day++) {
      const d = new Date(Date.UTC(2026, 4, 4 + day))
        .toISOString()
        .slice(0, 10);
      records.push(
        record({
          id: `u1-${day}`,
          user_id: "u1",
          clocked_in_at: `${d}T10:00:00Z`,
          clocked_out_at: `${d}T19:00:00Z`,
        }),
        record({
          id: `u2-${day}`,
          user_id: "u2",
          clocked_in_at: `${d}T10:00:00Z`,
          clocked_out_at: `${d}T18:00:00Z`,
        })
      );
    }
    const out = classifyHoursForPeriod({
      clockRecords: records,
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    const u1Weekly = out
      .filter((c) => c.staffId === "u1" && c.kind === "weekly_ot")
      .reduce((s, c) => s + c.hours, 0);
    const u2Weekly = out
      .filter((c) => c.staffId === "u2" && c.kind === "weekly_ot")
      .reduce((s, c) => s + c.hours, 0);
    expect(u1Weekly).toBe(1); // 45 - 44
    expect(u2Weekly).toBe(0); // 40 - 44
  });

  it("PH does not contribute to weekly OT threshold", () => {
    // 5 × 9h = 45h, but day-1 is a PH (9h public_holiday)
    // → weekly tally should only sum the non-PH days = 36h, no weekly OT.
    const records: ClockRecord[] = [];
    for (let day = 0; day < 5; day++) {
      const d = new Date(Date.UTC(2026, 4, 4 + day))
        .toISOString()
        .slice(0, 10);
      records.push(
        record({
          id: `r${day}`,
          user_id: "u1",
          clocked_in_at: `${d}T10:00:00Z`,
          clocked_out_at: `${d}T19:00:00Z`,
        })
      );
    }
    const ph: PayrollHoliday[] = [
      { date: "2026-05-04", name: "PH", is_active: true, created_at: FIXED_TS },
    ];
    const out = classifyHoursForPeriod({
      clockRecords: records,
      overtimeRules: SG_DEFAULT_RULES,
      holidays: ph,
      restDayResolver: NEVER_REST,
    });
    const phHours = out
      .filter((c) => c.kind === "public_holiday")
      .reduce((s, c) => s + c.hours, 0);
    const weeklyOt = out
      .filter((c) => c.kind === "weekly_ot")
      .reduce((s, c) => s + c.hours, 0);
    expect(phHours).toBe(9);
    expect(weeklyOt).toBe(0);
  });

  it("classification kind 'rest_day' takes 2.0 multiplier", () => {
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-10T10:00:00Z",
          clocked_out_at: "2026-05-10T16:00:00Z",
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: defaultRestDayResolver(SG_DEFAULT_RULES),
    });
    expect(out[0].multiplier).toBe(2.0);
  });

  it("multiple PH days all classified as public_holiday", () => {
    const ph: PayrollHoliday[] = [
      { date: "2026-05-04", name: "A", is_active: true, created_at: FIXED_TS },
      { date: "2026-05-05", name: "B", is_active: true, created_at: FIXED_TS },
    ];
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-04T10:00:00Z",
          clocked_out_at: "2026-05-04T18:00:00Z",
        }),
        record({
          id: "r2",
          user_id: "u1",
          clocked_in_at: "2026-05-05T10:00:00Z",
          clocked_out_at: "2026-05-05T18:00:00Z",
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: ph,
      restDayResolver: NEVER_REST,
    });
    expect(out.every((c) => c.kind === "public_holiday")).toBe(true);
  });

  it("rest_day_strategy='none' resolver flags nothing", () => {
    const rules = { ...SG_DEFAULT_RULES, rest_day_strategy: "none" as const };
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-10T10:00:00Z",
          clocked_out_at: "2026-05-10T16:00:00Z",
        }),
      ],
      overtimeRules: rules,
      holidays: [],
      restDayResolver: defaultRestDayResolver(rules),
    });
    expect(out[0].kind).toBe("regular");
  });

  it("output is ordered chronologically by record clock-in", () => {
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "later",
          user_id: "u1",
          clocked_in_at: "2026-05-05T10:00:00Z",
          clocked_out_at: "2026-05-05T18:00:00Z",
        }),
        record({
          id: "earlier",
          user_id: "u1",
          clocked_in_at: "2026-05-04T10:00:00Z",
          clocked_out_at: "2026-05-04T18:00:00Z",
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    expect(out[0].recordId).toBe("earlier");
    expect(out[1].recordId).toBe("later");
  });

  it("classifies a 24h-spanning shift correctly (cross-midnight)", () => {
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-04T22:00:00Z",
          clocked_out_at: "2026-05-05T06:00:00Z", // 8h, crosses midnight
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    expect(out).toHaveLength(1);
    expect(out[0].hours).toBe(8);
  });

  it("two records on the same day stack toward weekly running total", () => {
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-04T08:00:00Z",
          clocked_out_at: "2026-05-04T16:00:00Z", // 8h
        }),
        record({
          id: "r2",
          user_id: "u1",
          clocked_in_at: "2026-05-04T18:00:00Z",
          clocked_out_at: "2026-05-04T22:00:00Z", // 4h
        }),
      ],
      overtimeRules: { ...SG_DEFAULT_RULES, weekly_threshold_hours: 10 },
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    // Total 12h; threshold 10h → 10 regular + 2 weekly_ot.
    const reg = out.filter((c) => c.kind === "regular").reduce((s, c) => s + c.hours, 0);
    const ot = out.filter((c) => c.kind === "weekly_ot").reduce((s, c) => s + c.hours, 0);
    expect(reg).toBe(10);
    expect(ot).toBe(2);
  });

  it("returns empty when there are no clock records", () => {
    const out = classifyHoursForPeriod({
      clockRecords: [],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: [],
      restDayResolver: NEVER_REST,
    });
    expect(out).toEqual([]);
  });

  it("PH on Sunday classifies as public_holiday (PH > rest day)", () => {
    const ph: PayrollHoliday[] = [
      { date: "2026-05-10", name: "PH on Sunday", is_active: true, created_at: FIXED_TS },
    ];
    const out = classifyHoursForPeriod({
      clockRecords: [
        record({
          id: "r1",
          user_id: "u1",
          clocked_in_at: "2026-05-10T10:00:00Z",
          clocked_out_at: "2026-05-10T18:00:00Z",
        }),
      ],
      overtimeRules: SG_DEFAULT_RULES,
      holidays: ph,
      restDayResolver: defaultRestDayResolver(SG_DEFAULT_RULES),
    });
    expect(out[0].kind).toBe("public_holiday");
  });
});
