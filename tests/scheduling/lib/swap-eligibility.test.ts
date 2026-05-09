import { describe, expect, it } from "vitest";
import { getEligibleSwapTargets } from "@/scheduling/lib/swap-eligibility";
import type {
  AvailabilityBlock,
  FtAssignment,
  ScheduleShift,
  UserQualification,
} from "@/scheduling/types";

const baseShift: ScheduleShift = {
  id: "shift-1",
  week_id: "week-1",
  template_id: "tpl-pm",
  shift_date: "2026-05-05", // Tuesday
  start_time: "17:00:00",
  end_time: "23:00:00",
  user_id: "alice",
  role: "bartender",
  notes: null,
  created_at: "",
  updated_at: "",
};

const allStaff = [
  { id: "alice", full_name: "Alice", employment_type: "part_time" as const },
  { id: "bob",   full_name: "Bob",   employment_type: "part_time" as const },
  { id: "carol", full_name: "Carol", employment_type: "full_time" as const },
  { id: "dan",   full_name: "Dan",   employment_type: "part_time" as const },
];

const qualifications: UserQualification[] = [
  { user_id: "alice", qualification: "bartender", created_at: "" },
  { user_id: "bob",   qualification: "bartender", created_at: "" },
  { user_id: "carol", qualification: "bartender", created_at: "" },
  { user_id: "carol", qualification: "mod",       created_at: "" },
  { user_id: "dan",   qualification: "floor",     created_at: "" }, // not bartender
];

function block(user_id: string, start: string, end: string): AvailabilityBlock {
  return {
    id: `${user_id}-block`,
    user_id,
    week_start_date: "2026-05-04",
    day_of_week: 1, // Tuesday in Mon-based week
    start_time: start,
    end_time: end,
    note: null,
    created_at: "",
  };
}

describe("getEligibleSwapTargets", () => {
  it("excludes the requester themselves", () => {
    const result = getEligibleSwapTargets({
      shift: baseShift,
      requesterId: "alice",
      allStaff,
      qualifications,
      ftAssignments: [],
      availabilityByUser: new Map([
        ["alice", [block("alice", "17:00:00", "23:00:00")]],
        ["bob",   [block("bob",   "17:00:00", "23:00:00")]],
      ]),
      sameDayShiftsByUser: new Map(),
    });
    expect(result.map((s) => s.id)).not.toContain("alice");
  });

  it("excludes users without the shift's qualification", () => {
    const result = getEligibleSwapTargets({
      shift: baseShift,
      requesterId: "alice",
      allStaff,
      qualifications,
      ftAssignments: [],
      availabilityByUser: new Map([
        ["bob", [block("bob", "17:00:00", "23:00:00")]],
        ["dan", [block("dan", "17:00:00", "23:00:00")]],
      ]),
      sameDayShiftsByUser: new Map(),
    });
    expect(result.map((s) => s.id)).not.toContain("dan");
  });

  it("includes a PT user whose availability covers the shift", () => {
    const result = getEligibleSwapTargets({
      shift: baseShift,
      requesterId: "alice",
      allStaff,
      qualifications,
      ftAssignments: [],
      availabilityByUser: new Map([
        ["bob", [block("bob", "16:00:00", "23:30:00")]],
      ]),
      sameDayShiftsByUser: new Map(),
    });
    expect(result.map((s) => s.id)).toContain("bob");
  });

  it("excludes a PT user with no availability that day", () => {
    const result = getEligibleSwapTargets({
      shift: baseShift,
      requesterId: "alice",
      allStaff,
      qualifications,
      ftAssignments: [],
      availabilityByUser: new Map(),
      sameDayShiftsByUser: new Map(),
    });
    expect(result.map((s) => s.id)).not.toContain("bob");
  });

  it("includes a FT user who has a matching standing assignment", () => {
    const ft: FtAssignment[] = [
      {
        id: "ft-carol",
        user_id: "carol",
        template_id: "tpl-pm",
        day_of_week: 1,
        role: "bartender",
        effective_from: "2026-01-01",
        effective_until: null,
        created_at: "",
        updated_at: "",
      },
    ];
    const result = getEligibleSwapTargets({
      shift: baseShift,
      requesterId: "alice",
      allStaff,
      qualifications,
      ftAssignments: ft,
      availabilityByUser: new Map(),
      sameDayShiftsByUser: new Map(),
    });
    expect(result.map((s) => s.id)).toContain("carol");
  });

  it("excludes a FT user without a matching standing assignment", () => {
    const result = getEligibleSwapTargets({
      shift: baseShift,
      requesterId: "alice",
      allStaff,
      qualifications,
      ftAssignments: [],
      availabilityByUser: new Map(),
      sameDayShiftsByUser: new Map(),
    });
    expect(result.map((s) => s.id)).not.toContain("carol");
  });

  it("excludes a user with a same-day overlapping shift", () => {
    const overlap: ScheduleShift = {
      ...baseShift,
      id: "shift-2",
      start_time: "19:00:00",
      end_time: "22:00:00",
      user_id: "bob",
    };
    const result = getEligibleSwapTargets({
      shift: baseShift,
      requesterId: "alice",
      allStaff,
      qualifications,
      ftAssignments: [],
      availabilityByUser: new Map([
        ["bob", [block("bob", "16:00:00", "23:30:00")]],
      ]),
      sameDayShiftsByUser: new Map([["bob", [overlap]]]),
    });
    expect(result.map((s) => s.id)).not.toContain("bob");
  });

  it("does NOT exclude when same-day shift is the same shift being swapped", () => {
    // Defensive: the shift being swapped should not count as a same-day
    // overlap with itself.
    const result = getEligibleSwapTargets({
      shift: baseShift,
      requesterId: "alice",
      allStaff,
      qualifications,
      ftAssignments: [],
      availabilityByUser: new Map([
        ["bob", [block("bob", "16:00:00", "23:30:00")]],
      ]),
      sameDayShiftsByUser: new Map([["bob", [baseShift]]]),
    });
    expect(result.map((s) => s.id)).toContain("bob");
  });

  it("excludes a user with multiple same-day overlapping shifts", () => {
    const a: ScheduleShift = { ...baseShift, id: "a", start_time: "10:00:00", end_time: "14:00:00", user_id: "bob" };
    const b: ScheduleShift = { ...baseShift, id: "b", start_time: "20:00:00", end_time: "22:00:00", user_id: "bob" };
    const result = getEligibleSwapTargets({
      shift: baseShift,
      requesterId: "alice",
      allStaff,
      qualifications,
      ftAssignments: [],
      availabilityByUser: new Map([
        ["bob", [block("bob", "16:00:00", "23:30:00")]],
      ]),
      sameDayShiftsByUser: new Map([["bob", [a, b]]]),
    });
    expect(result.map((s) => s.id)).not.toContain("bob");
  });

  it("includes a user whose same-day shift does not overlap the candidate", () => {
    const earlier: ScheduleShift = {
      ...baseShift,
      id: "earlier",
      start_time: "10:00:00",
      end_time: "14:00:00",
      user_id: "bob",
    };
    const result = getEligibleSwapTargets({
      shift: baseShift,
      requesterId: "alice",
      allStaff,
      qualifications,
      ftAssignments: [],
      availabilityByUser: new Map([
        ["bob", [block("bob", "16:00:00", "23:30:00")]],
      ]),
      sameDayShiftsByUser: new Map([["bob", [earlier]]]),
    });
    expect(result.map((s) => s.id)).toContain("bob");
  });

  it("returns no targets when no staff match all filters", () => {
    const result = getEligibleSwapTargets({
      shift: baseShift,
      requesterId: "alice",
      allStaff: [allStaff[0], allStaff[3]], // alice and dan only
      qualifications,
      ftAssignments: [],
      availabilityByUser: new Map(),
      sameDayShiftsByUser: new Map(),
    });
    expect(result).toEqual([]);
  });
});
