import { describe, expect, it } from "vitest";
import {
  isUserAvailableForShift,
  timeRangesOverlap,
  timeToMinutes,
} from "@/scheduling/lib/availability-check";
import type { AvailabilityBlock, FtAssignment } from "@/scheduling/types";

const FIXED_TS = "2025-01-01T00:00:00.000Z";
const monday = "2026-05-04";

function block(
  partial: Omit<AvailabilityBlock, "id" | "created_at"> & { id?: string }
): AvailabilityBlock {
  return {
    id: partial.id ?? `b-${Math.random().toString(36).slice(2, 8)}`,
    user_id: partial.user_id,
    week_start_date: partial.week_start_date,
    day_of_week: partial.day_of_week,
    start_time: partial.start_time,
    end_time: partial.end_time,
    note: partial.note,
    created_at: FIXED_TS,
  };
}

function ft(partial: Partial<FtAssignment>): FtAssignment {
  return {
    id: partial.id ?? `fa-${Math.random().toString(36).slice(2, 6)}`,
    user_id: partial.user_id ?? "u1",
    template_id: partial.template_id ?? "am",
    day_of_week: partial.day_of_week ?? 0,
    role: partial.role ?? "bartender",
    effective_from: partial.effective_from ?? "2024-01-01",
    effective_until: partial.effective_until ?? null,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
  };
}

describe("timeToMinutes", () => {
  it("converts HH:MM correctly", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("01:30")).toBe(90);
    expect(timeToMinutes("23:59")).toBe(23 * 60 + 59);
  });
  it("ignores trailing seconds", () => {
    expect(timeToMinutes("17:00:00")).toBe(17 * 60);
  });
});

describe("timeRangesOverlap", () => {
  it("strictly-before does not overlap", () => {
    expect(timeRangesOverlap("10:00", "12:00", "12:00", "14:00")).toBe(false);
  });
  it("partial overlap returns true", () => {
    expect(timeRangesOverlap("10:00", "13:00", "12:00", "14:00")).toBe(true);
  });
  it("full containment returns true", () => {
    expect(timeRangesOverlap("10:00", "18:00", "12:00", "14:00")).toBe(true);
  });
});

describe("isUserAvailableForShift — PT", () => {
  const shift = {
    shift_date: monday,
    template_id: "am",
    start_time: "10:00:00",
    end_time: "18:00:00",
  };

  it("ok=true when a single block exactly covers the shift", () => {
    const r = isUserAvailableForShift({
      user_employment_type: "part_time",
      shift,
      availabilityBlocks: [
        block({
          user_id: "u1",
          week_start_date: monday,
          day_of_week: 0,
          start_time: "10:00:00",
          end_time: "18:00:00",
          note: null,
        }),
      ],
      ftAssignments: [],
    });
    expect(r.ok).toBe(true);
  });

  it("ok=true when block is wider than shift", () => {
    const r = isUserAvailableForShift({
      user_employment_type: "part_time",
      shift,
      availabilityBlocks: [
        block({
          user_id: "u1",
          week_start_date: monday,
          day_of_week: 0,
          start_time: "08:00:00",
          end_time: "20:00:00",
          note: null,
        }),
      ],
      ftAssignments: [],
    });
    expect(r.ok).toBe(true);
  });

  it("ok=false when block ends before shift end", () => {
    const r = isUserAvailableForShift({
      user_employment_type: "part_time",
      shift,
      availabilityBlocks: [
        block({
          user_id: "u1",
          week_start_date: monday,
          day_of_week: 0,
          start_time: "10:00:00",
          end_time: "16:00:00",
          note: null,
        }),
      ],
      ftAssignments: [],
    });
    expect(r.ok).toBe(false);
  });

  it("ok=true when two adjacent blocks union to cover the shift", () => {
    const r = isUserAvailableForShift({
      user_employment_type: "part_time",
      shift,
      availabilityBlocks: [
        block({
          user_id: "u1",
          week_start_date: monday,
          day_of_week: 0,
          start_time: "10:00:00",
          end_time: "14:00:00",
          note: null,
        }),
        block({
          user_id: "u1",
          week_start_date: monday,
          day_of_week: 0,
          start_time: "14:00:00",
          end_time: "18:00:00",
          note: null,
        }),
      ],
      ftAssignments: [],
    });
    expect(r.ok).toBe(true);
  });

  it("ok=false when blocks have a gap inside the shift window", () => {
    const r = isUserAvailableForShift({
      user_employment_type: "part_time",
      shift,
      availabilityBlocks: [
        block({
          user_id: "u1",
          week_start_date: monday,
          day_of_week: 0,
          start_time: "10:00:00",
          end_time: "12:00:00",
          note: null,
        }),
        block({
          user_id: "u1",
          week_start_date: monday,
          day_of_week: 0,
          start_time: "14:00:00",
          end_time: "18:00:00",
          note: null,
        }),
      ],
      ftAssignments: [],
    });
    expect(r.ok).toBe(false);
  });

  it("ok=false with no blocks at all", () => {
    const r = isUserAvailableForShift({
      user_employment_type: "part_time",
      shift,
      availabilityBlocks: [],
      ftAssignments: [],
    });
    expect(r.ok).toBe(false);
  });

  it("ignores blocks for a different day_of_week", () => {
    const r = isUserAvailableForShift({
      user_employment_type: "part_time",
      shift,
      availabilityBlocks: [
        block({
          user_id: "u1",
          week_start_date: monday,
          day_of_week: 4, // Friday
          start_time: "08:00:00",
          end_time: "20:00:00",
          note: null,
        }),
      ],
      ftAssignments: [],
    });
    expect(r.ok).toBe(false);
  });
});

describe("isUserAvailableForShift — FT", () => {
  const shift = {
    shift_date: monday,
    template_id: "am",
    start_time: "10:00:00",
    end_time: "18:00:00",
  };

  it("ok=true when an FT row covers the shift", () => {
    const r = isUserAvailableForShift({
      user_employment_type: "full_time",
      shift,
      availabilityBlocks: [],
      ftAssignments: [ft({ template_id: "am", day_of_week: 0 })],
    });
    expect(r.ok).toBe(true);
  });

  it("ok=false when no FT row matches", () => {
    const r = isUserAvailableForShift({
      user_employment_type: "full_time",
      shift,
      availabilityBlocks: [],
      ftAssignments: [ft({ template_id: "pm", day_of_week: 0 })],
    });
    expect(r.ok).toBe(false);
  });

  it("ok=false when FT row matches template+dow but is out of effective window", () => {
    const r = isUserAvailableForShift({
      user_employment_type: "full_time",
      shift,
      availabilityBlocks: [],
      ftAssignments: [
        ft({
          template_id: "am",
          day_of_week: 0,
          effective_until: "2026-05-03",
        }),
      ],
    });
    expect(r.ok).toBe(false);
  });
});
