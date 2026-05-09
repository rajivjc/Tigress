// =============================================================================
// Payroll engine end-to-end (S27a-fix-2 Finding 1)
// =============================================================================
// Verifies that the engine entry point correctly composes rate-resolution
// + overtime-classification + line-item-aggregation. The S27a engine
// shipped with `role: ""` and a zero-length window placeholder, which
// meant role + time-of-day multipliers never fired even when rules were
// configured. These tests fail under that shape and pass under the
// per-record resolution introduced in S27a-fix-2.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeEngineItems } from "@/scheduling/payroll/lib/engine";
import {
  MOCK_PAYROLL_RATE_RULES,
  MOCK_PAYROLL_RATES,
  MOCK_PAYROLL_SETTINGS,
  __resetMockPayroll,
} from "@/scheduling/payroll/data/mock-data";
import {
  MOCK_SCHEDULE_CLOCK_RECORDS,
  MOCK_SCHEDULE_SHIFTS,
} from "@/scheduling/data/mock-data";
import type { ClockRecord, ScheduleShift } from "@/scheduling/types";
import type { PayrollRateRule } from "@/scheduling/payroll/types";

const FIXED = "2025-01-01T00:00:00.000Z";
const RUN_ID = "run-engine-test";

function shift(partial: Partial<ScheduleShift> & {
  id: string;
  start_time?: string;
  end_time?: string;
  role?: ScheduleShift["role"];
}): ScheduleShift {
  return {
    id: partial.id,
    week_id: partial.week_id ?? "week-1",
    template_id: partial.template_id ?? "schedule-template-am",
    shift_date: partial.shift_date ?? "2026-05-04",
    start_time: partial.start_time ?? "10:00:00",
    end_time: partial.end_time ?? "18:00:00",
    user_id: partial.user_id ?? "mock-staff-row-1",
    role: partial.role ?? "bartender",
    notes: partial.notes ?? null,
    created_at: FIXED,
    updated_at: FIXED,
  };
}

function clock(partial: Partial<ClockRecord> & {
  id: string;
  shift_id: string;
  user_id: string;
  clocked_in_at: string;
  clocked_out_at: string;
}): ClockRecord {
  return {
    id: partial.id,
    shift_id: partial.shift_id,
    user_id: partial.user_id,
    clocked_in_at: partial.clocked_in_at,
    clocked_out_at: partial.clocked_out_at,
    status: partial.status ?? "locked",
    locked_at: partial.locked_at ?? FIXED,
    locked_by: partial.locked_by ?? "owner-1",
    unlock_note: null,
    manager_edited: false,
    manager_edit_note: null,
    created_at: FIXED,
    updated_at: FIXED,
  };
}

function rule(
  partial: Partial<PayrollRateRule> & {
    kind: PayrollRateRule["kind"];
    match_value: string;
    multiplier: number;
  }
): PayrollRateRule {
  return {
    id: partial.id ?? `r-${Math.random().toString(36).slice(2, 10)}`,
    kind: partial.kind,
    match_value: partial.match_value,
    window_start: partial.window_start ?? null,
    window_end: partial.window_end ?? null,
    multiplier: partial.multiplier,
    priority: partial.priority ?? 100,
    is_active: partial.is_active ?? true,
    created_at: FIXED,
    updated_at: FIXED,
  };
}

const PERIOD = {
  runId: RUN_ID,
  periodStart: "2026-05-04",
  periodEnd: "2026-05-10",
};

beforeEach(() => {
  __resetMockPayroll();
  MOCK_SCHEDULE_SHIFTS.length = 0;
  MOCK_SCHEDULE_CLOCK_RECORDS.length = 0;
  // Disable statutory deduction by default so test arithmetic is clean.
  MOCK_PAYROLL_SETTINGS[0].statutory_deduction_pct = 0;
});

describe("computeEngineItems", () => {
  it("base-rate-only path produces one line item at the staff's hourly rate", async () => {
    MOCK_SCHEDULE_SHIFTS.push(
      shift({ id: "sh-1", role: "bartender", start_time: "10:00:00", end_time: "18:00:00" })
    );
    MOCK_SCHEDULE_CLOCK_RECORDS.push(
      clock({
        id: "cr-1",
        shift_id: "sh-1",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-04T02:00:00Z",
        clocked_out_at: "2026-05-04T10:00:00Z",
      })
    );

    const { drafts } = await computeEngineItems(PERIOD);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      kind: "hours",
      hours: 8,
      // mock-staff-row-1 base rate is 16
      amount: 128,
      rate_applied: 16,
    });
    expect(drafts[0].multipliers).toBeNull();
  });

  it("role multiplier fires end-to-end (was the inert dimension before this fix)", async () => {
    MOCK_PAYROLL_RATE_RULES.push(
      rule({ kind: "role", match_value: "bartender", multiplier: 1.5 })
    );
    MOCK_SCHEDULE_SHIFTS.push(
      shift({ id: "sh-1", role: "bartender", start_time: "10:00:00", end_time: "18:00:00" })
    );
    MOCK_SCHEDULE_CLOCK_RECORDS.push(
      clock({
        id: "cr-1",
        shift_id: "sh-1",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-04T02:00:00Z",
        clocked_out_at: "2026-05-04T10:00:00Z",
      })
    );

    const { drafts } = await computeEngineItems(PERIOD);
    expect(drafts).toHaveLength(1);
    // 16 base × 1.5 role = 24 effective; 8h × 24 = 192.
    expect(drafts[0].amount).toBe(192);
    expect(drafts[0].rate_applied).toBe(24);
    expect(drafts[0].multipliers).toMatchObject({ "role:bartender": 1.5 });
  });

  it("time-of-day multiplier fires end-to-end", async () => {
    MOCK_PAYROLL_RATE_RULES.push(
      rule({
        kind: "time_of_day",
        match_value: "after_22",
        window_start: "22:00:00",
        window_end: "06:00:00",
        multiplier: 1.25,
      })
    );
    // Shift 22:00–02:00 next day (wrap) on a Wednesday so it isn't a rest day.
    MOCK_SCHEDULE_SHIFTS.push(
      shift({
        id: "sh-1",
        role: "bartender",
        shift_date: "2026-05-06",
        start_time: "22:00:00",
        end_time: "02:00:00",
      })
    );
    MOCK_SCHEDULE_CLOCK_RECORDS.push(
      clock({
        id: "cr-1",
        shift_id: "sh-1",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-06T14:00:00Z", // 22:00 SGT
        clocked_out_at: "2026-05-06T18:00:00Z", // 02:00 SGT next day
      })
    );

    const { drafts } = await computeEngineItems(PERIOD);
    expect(drafts).toHaveLength(1);
    // 16 base × 1.25 = 20; 4h × 20 = 80.
    expect(drafts[0].amount).toBe(80);
    expect(drafts[0].multipliers).toMatchObject({
      "time_of_day:after_22": 1.25,
    });
  });

  it("role and time-of-day multipliers compose multiplicatively", async () => {
    MOCK_PAYROLL_RATE_RULES.push(
      rule({ kind: "role", match_value: "bartender", multiplier: 1.5 }),
      rule({
        kind: "time_of_day",
        match_value: "after_22",
        window_start: "22:00:00",
        window_end: "06:00:00",
        multiplier: 1.25,
      })
    );
    MOCK_SCHEDULE_SHIFTS.push(
      shift({
        id: "sh-1",
        role: "bartender",
        shift_date: "2026-05-06",
        start_time: "22:00:00",
        end_time: "02:00:00",
      })
    );
    MOCK_SCHEDULE_CLOCK_RECORDS.push(
      clock({
        id: "cr-1",
        shift_id: "sh-1",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-06T14:00:00Z",
        clocked_out_at: "2026-05-06T18:00:00Z",
      })
    );

    const { drafts } = await computeEngineItems(PERIOD);
    expect(drafts).toHaveLength(1);
    // 16 × 1.5 × 1.25 = 30; 4h × 30 = 120.
    expect(drafts[0].amount).toBe(120);
    expect(drafts[0].rate_applied).toBe(30);
    expect(drafts[0].multipliers).toMatchObject({
      "role:bartender": 1.5,
      "time_of_day:after_22": 1.25,
    });
  });

  it("inactive rule does not fire", async () => {
    MOCK_PAYROLL_RATE_RULES.push(
      rule({
        kind: "role",
        match_value: "bartender",
        multiplier: 1.5,
        is_active: false,
      })
    );
    MOCK_SCHEDULE_SHIFTS.push(
      shift({ id: "sh-1", role: "bartender" })
    );
    MOCK_SCHEDULE_CLOCK_RECORDS.push(
      clock({
        id: "cr-1",
        shift_id: "sh-1",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-04T02:00:00Z",
        clocked_out_at: "2026-05-04T10:00:00Z",
      })
    );

    const { drafts } = await computeEngineItems(PERIOD);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].amount).toBe(128); // base only (16 × 8)
  });

  it("per-record split: same staff + same kind + different rates → distinct line items", async () => {
    MOCK_PAYROLL_RATE_RULES.push(
      rule({ kind: "role", match_value: "mod", multiplier: 2.0 })
    );
    MOCK_SCHEDULE_SHIFTS.push(
      shift({ id: "sh-bartender", role: "bartender", start_time: "10:00:00", end_time: "14:00:00" }),
      shift({
        id: "sh-mod",
        role: "mod",
        shift_date: "2026-05-05",
        start_time: "15:00:00",
        end_time: "19:00:00",
      })
    );
    MOCK_SCHEDULE_CLOCK_RECORDS.push(
      clock({
        id: "cr-bartender",
        shift_id: "sh-bartender",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-04T02:00:00Z",
        clocked_out_at: "2026-05-04T06:00:00Z",
      }),
      clock({
        id: "cr-mod",
        shift_id: "sh-mod",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-05T07:00:00Z",
        clocked_out_at: "2026-05-05T11:00:00Z",
      })
    );

    const { drafts } = await computeEngineItems(PERIOD);
    // Same staff + same `kind: hours` but two different effective rates →
    // two engine line items so the breakdown is visible.
    const hoursItems = drafts.filter((d) => d.kind === "hours");
    expect(hoursItems).toHaveLength(2);
    const bartenderItem = hoursItems.find((d) => d.rate_applied === 16);
    const modItem = hoursItems.find((d) => d.rate_applied === 32);
    expect(bartenderItem).toBeDefined();
    expect(modItem).toBeDefined();
    expect(bartenderItem!.amount).toBe(64); // 16 × 4
    expect(modItem!.amount).toBe(128); // 32 × 4
  });

  it("statutory deduction line item appended when settings.statutory_deduction_pct > 0", async () => {
    MOCK_PAYROLL_SETTINGS[0].statutory_deduction_pct = 10;
    MOCK_SCHEDULE_SHIFTS.push(shift({ id: "sh-1" }));
    MOCK_SCHEDULE_CLOCK_RECORDS.push(
      clock({
        id: "cr-1",
        shift_id: "sh-1",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-04T02:00:00Z",
        clocked_out_at: "2026-05-04T10:00:00Z",
      })
    );

    const { drafts } = await computeEngineItems(PERIOD);
    const stat = drafts.find((d) => d.kind === "statutory");
    expect(stat).toBeDefined();
    // 8h × 16 = 128; 10% deduction = -12.8.
    expect(stat!.amount).toBe(-12.8);
  });

  it("orphan clock record (parent shift missing) is skipped with a warning, not failed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // No shift inserted — the record points at a phantom shift_id.
    MOCK_SCHEDULE_CLOCK_RECORDS.push(
      clock({
        id: "cr-orphan",
        shift_id: "phantom-shift",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-04T02:00:00Z",
        clocked_out_at: "2026-05-04T10:00:00Z",
      })
    );

    const { drafts } = await computeEngineItems(PERIOD);
    expect(drafts).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("OT classification + role multiplier compose: weekly_ot rate = base × role × OT_MULT", async () => {
    MOCK_PAYROLL_RATE_RULES.push(
      rule({ kind: "role", match_value: "bartender", multiplier: 1.5 })
    );
    // 5 × 9-hour bartender shifts = 45h, weekly threshold is 44h → 1h OT.
    MOCK_SCHEDULE_SHIFTS.push(
      shift({ id: "sh-1", shift_date: "2026-05-04", start_time: "10:00:00", end_time: "19:00:00" }),
      shift({ id: "sh-2", shift_date: "2026-05-05", start_time: "10:00:00", end_time: "19:00:00" }),
      shift({ id: "sh-3", shift_date: "2026-05-06", start_time: "10:00:00", end_time: "19:00:00" }),
      shift({ id: "sh-4", shift_date: "2026-05-07", start_time: "10:00:00", end_time: "19:00:00" }),
      shift({ id: "sh-5", shift_date: "2026-05-08", start_time: "10:00:00", end_time: "19:00:00" })
    );
    for (let i = 0; i < 5; i++) {
      MOCK_SCHEDULE_CLOCK_RECORDS.push(
        clock({
          id: `cr-${i + 1}`,
          shift_id: `sh-${i + 1}`,
          user_id: "mock-staff-row-1",
          // 10:00 SGT = 02:00 UTC, 19:00 SGT = 11:00 UTC, on 2026-05-(04+i).
          clocked_in_at: `2026-05-0${4 + i}T02:00:00Z`,
          clocked_out_at: `2026-05-0${4 + i}T11:00:00Z`,
        })
      );
    }

    const { drafts } = await computeEngineItems(PERIOD);
    const ot = drafts.find((d) => d.kind === "overtime");
    expect(ot).toBeDefined();
    // 16 × 1.5 × 1.5 (weekly OT) = 36; 1h × 36 = 36.
    expect(ot!.hours).toBe(1);
    expect(ot!.amount).toBe(36);
    expect(ot!.multipliers).toMatchObject({
      "role:bartender": 1.5,
      "ot:weekly_ot": 1.5,
    });
  });

  it("public holiday + role multiplier compose: PH rate = base × role × PH_MULT", async () => {
    MOCK_PAYROLL_RATE_RULES.push(
      rule({ kind: "role", match_value: "bartender", multiplier: 1.5 })
    );
    // 2026-05-01 is Labour Day (seeded in MOCK_PAYROLL_HOLIDAYS).
    const PERIOD_PH = {
      runId: RUN_ID,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-03",
    };
    MOCK_SCHEDULE_SHIFTS.push(
      shift({ id: "sh-ph", shift_date: "2026-05-01", start_time: "10:00:00", end_time: "18:00:00" })
    );
    MOCK_SCHEDULE_CLOCK_RECORDS.push(
      clock({
        id: "cr-ph",
        shift_id: "sh-ph",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-01T02:00:00Z",
        clocked_out_at: "2026-05-01T10:00:00Z",
      })
    );

    const { drafts } = await computeEngineItems(PERIOD_PH);
    const ph = drafts.find((d) => d.kind === "public_holiday");
    expect(ph).toBeDefined();
    // 16 × 1.5 × 2 = 48; 8h × 48 = 384.
    expect(ph!.amount).toBe(384);
    expect(ph!.multipliers).toMatchObject({
      "role:bartender": 1.5,
      "ot:public_holiday": 2,
    });
  });

  it("empty period (no records) returns empty drafts", async () => {
    const { drafts } = await computeEngineItems(PERIOD);
    expect(drafts).toEqual([]);
  });

  it("multi-staff: each staff's items use their own base rate", async () => {
    MOCK_SCHEDULE_SHIFTS.push(
      shift({ id: "sh-1", user_id: "mock-staff-row-1" }),
      shift({ id: "sh-2", user_id: "mock-staff-row-2", shift_date: "2026-05-05" })
    );
    MOCK_SCHEDULE_CLOCK_RECORDS.push(
      clock({
        id: "cr-1",
        shift_id: "sh-1",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-04T02:00:00Z",
        clocked_out_at: "2026-05-04T10:00:00Z",
      }),
      clock({
        id: "cr-2",
        shift_id: "sh-2",
        user_id: "mock-staff-row-2",
        clocked_in_at: "2026-05-05T02:00:00Z",
        clocked_out_at: "2026-05-05T10:00:00Z",
      })
    );

    const { drafts } = await computeEngineItems(PERIOD);
    const s1 = drafts.find((d) => d.staff_id === "mock-staff-row-1");
    const s2 = drafts.find((d) => d.staff_id === "mock-staff-row-2");
    expect(s1!.amount).toBe(128); // 16 × 8
    expect(s2!.amount).toBe(176); // 22 × 8 — base rate for staff-row-2 is 22
  });

  it("period boundary: record before start excluded; record exactly at start included", async () => {
    MOCK_SCHEDULE_SHIFTS.push(
      shift({ id: "sh-before", shift_date: "2026-05-03" }),
      shift({ id: "sh-at", shift_date: "2026-05-04" })
    );
    MOCK_SCHEDULE_CLOCK_RECORDS.push(
      clock({
        id: "cr-before",
        shift_id: "sh-before",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-03T23:59:59Z",
        clocked_out_at: "2026-05-04T01:00:00Z",
      }),
      clock({
        id: "cr-at",
        shift_id: "sh-at",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-04T00:00:00Z",
        clocked_out_at: "2026-05-04T08:00:00Z",
      })
    );

    const { drafts } = await computeEngineItems(PERIOD);
    // Only the at-boundary record is included — 8h × 16 = 128.
    expect(drafts).toHaveLength(1);
    expect(drafts[0].amount).toBe(128);
  });

  it("recompute idempotency: running engine twice on same inputs yields identical drafts", async () => {
    MOCK_SCHEDULE_SHIFTS.push(shift({ id: "sh-1" }));
    MOCK_SCHEDULE_CLOCK_RECORDS.push(
      clock({
        id: "cr-1",
        shift_id: "sh-1",
        user_id: "mock-staff-row-1",
        clocked_in_at: "2026-05-04T02:00:00Z",
        clocked_out_at: "2026-05-04T10:00:00Z",
      })
    );

    const { drafts: a } = await computeEngineItems(PERIOD);
    const { drafts: b } = await computeEngineItems(PERIOD);
    expect(b).toEqual(a);
  });
});
