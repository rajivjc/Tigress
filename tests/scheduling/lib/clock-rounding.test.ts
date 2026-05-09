import { describe, expect, it } from "vitest";
import { applyRoundingRules } from "@/scheduling/lib/clock-rounding";

// Use the canonical ".000Z" form so direct string equality holds — the
// production helper round-trips through Date#toISOString which always
// includes milliseconds.
const SCHED_START = "2026-05-04T10:00:00.000Z";
const SCHED_END = "2026-05-04T18:00:00.000Z";

function iso(offsetMin: number): string {
  return new Date(Date.parse(SCHED_START) + offsetMin * 60_000).toISOString();
}

describe("applyRoundingRules", () => {
  it("snaps clock-in inside the 5-min grace window to scheduled start", () => {
    const r = applyRoundingRules({
      scheduledStart: SCHED_START,
      scheduledEnd: SCHED_END,
      actualIn: iso(-3),
      actualOut: iso(480),
    });
    expect(r.effectiveStart).toBe(SCHED_START);
  });

  it("snaps clock-in exactly at scheduled start to scheduled start", () => {
    const r = applyRoundingRules({
      scheduledStart: SCHED_START,
      scheduledEnd: SCHED_END,
      actualIn: iso(0),
      actualOut: iso(480),
    });
    expect(r.effectiveStart).toBe(SCHED_START);
  });

  it("uses actual time when clock-in is exactly 5 min early (grace boundary excludes the equal case)", () => {
    // The grace window is (-5, 0] minutes — the user came in too early to be
    // snapped, but not so early as to be unusual. We treat that as actual.
    const r = applyRoundingRules({
      scheduledStart: SCHED_START,
      scheduledEnd: SCHED_END,
      actualIn: iso(-5),
      actualOut: iso(480),
    });
    expect(r.effectiveStart).toBe(iso(-5));
  });

  it("treats clock-in earlier than 5 min before scheduled as actual (no payment for unscheduled time)", () => {
    const r = applyRoundingRules({
      scheduledStart: SCHED_START,
      scheduledEnd: SCHED_END,
      actualIn: iso(-15),
      actualOut: iso(480),
    });
    expect(r.effectiveStart).toBe(iso(-15));
  });

  it("uses actual time when clock-in is 1 min late (no grace forwards)", () => {
    const r = applyRoundingRules({
      scheduledStart: SCHED_START,
      scheduledEnd: SCHED_END,
      actualIn: iso(1),
      actualOut: iso(480),
    });
    expect(r.effectiveStart).toBe(iso(1));
  });

  it("uses actual time when clock-in is 6 min late", () => {
    const r = applyRoundingRules({
      scheduledStart: SCHED_START,
      scheduledEnd: SCHED_END,
      actualIn: iso(6),
      actualOut: iso(480),
    });
    expect(r.effectiveStart).toBe(iso(6));
  });

  it("uses actual time when clock-in is exactly 10 min late", () => {
    const r = applyRoundingRules({
      scheduledStart: SCHED_START,
      scheduledEnd: SCHED_END,
      actualIn: iso(10),
      actualOut: iso(480),
    });
    expect(r.effectiveStart).toBe(iso(10));
  });

  it("returns durationMinutes as null when clocked_out_at is missing", () => {
    const r = applyRoundingRules({
      scheduledStart: SCHED_START,
      scheduledEnd: SCHED_END,
      actualIn: iso(0),
      actualOut: null,
    });
    expect(r.effectiveEnd).toBeNull();
    expect(r.durationMinutes).toBeNull();
  });

  it("clock-out always uses actual time, including early outs", () => {
    const r = applyRoundingRules({
      scheduledStart: SCHED_START,
      scheduledEnd: SCHED_END,
      actualIn: iso(0),
      actualOut: iso(420), // 1h before scheduled end
    });
    expect(r.effectiveEnd).toBe(iso(420));
    expect(r.durationMinutes).toBe(420);
  });

  it("clock-out late counts every minute", () => {
    const r = applyRoundingRules({
      scheduledStart: SCHED_START,
      scheduledEnd: SCHED_END,
      actualIn: iso(0),
      actualOut: iso(525), // 45 min past scheduled end
    });
    expect(r.durationMinutes).toBe(525);
  });

  it("zero duration when clock-out is before clock-in (defensive against bad edits)", () => {
    const r = applyRoundingRules({
      scheduledStart: SCHED_START,
      scheduledEnd: SCHED_END,
      actualIn: iso(60),
      actualOut: iso(30),
    });
    expect(r.durationMinutes).toBe(0);
  });

  it("rounds duration to nearest minute", () => {
    const r = applyRoundingRules({
      scheduledStart: SCHED_START,
      scheduledEnd: SCHED_END,
      actualIn: SCHED_START,
      actualOut: new Date(Date.parse(SCHED_START) + 30 * 60_000 + 31 * 1000).toISOString(),
    });
    // 30 min 31 sec → 31 min after rounding
    expect(r.durationMinutes).toBe(31);
  });

  it("works across a midnight boundary", () => {
    const start = "2026-05-04T23:30:00.000Z";
    const end = "2026-05-05T03:30:00.000Z";
    const r = applyRoundingRules({
      scheduledStart: start,
      scheduledEnd: end,
      actualIn: "2026-05-04T23:28:00Z",
      actualOut: "2026-05-05T03:32:00Z",
    });
    expect(r.effectiveStart).toBe(start);
    // 23:30 → 03:32 = 4h 2min (clock-in snaps inside grace; clock-out
    // stays as actual)
    expect(r.durationMinutes).toBe(242);
  });

  it("throws on malformed input", () => {
    expect(() =>
      applyRoundingRules({
        scheduledStart: "not-a-date",
        scheduledEnd: SCHED_END,
        actualIn: SCHED_START,
        actualOut: SCHED_END,
      })
    ).toThrow();
  });
});
