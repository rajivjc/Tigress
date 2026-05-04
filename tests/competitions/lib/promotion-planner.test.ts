import { describe, it, expect } from "vitest";
import {
  planPromotions,
  PromotionPlannerError,
  type PlannerEntrant,
  type PlannerInput,
  type PlannerOverride,
} from "@/competitions/lib/promotion-planner";

function entrant(
  position: number,
  overrides: Partial<PlannerEntrant> = {}
): PlannerEntrant {
  return {
    entrantId: `e-${position}`,
    teamId: `t-${position}`,
    position,
    status: "active",
    isTiedWithNext: false,
    ...overrides,
  };
}

function input(
  entrants: PlannerEntrant[],
  promoteCount: number,
  relegateCount: number,
  overrides: Array<[string, PlannerOverride]> = []
): PlannerInput {
  return {
    entrants,
    promoteCount,
    relegateCount,
    overrides: new Map(overrides),
  };
}

describe("planPromotions", () => {
  it("middle tier: 6 entrants, promote=2, relegate=2 → 1-2 promote, 3-4 stay, 5-6 relegate", () => {
    const decisions = planPromotions(
      input(
        [entrant(1), entrant(2), entrant(3), entrant(4), entrant(5), entrant(6)],
        2,
        2
      )
    );
    expect(decisions.map((d) => d.decision)).toEqual([
      "promote",
      "promote",
      "stay",
      "stay",
      "relegate",
      "relegate",
    ]);
  });

  it("top tier: promote=0, relegate=2 → only the bottom two relegate", () => {
    const decisions = planPromotions(
      input(
        [entrant(1), entrant(2), entrant(3), entrant(4), entrant(5)],
        0,
        2
      )
    );
    expect(decisions.map((d) => d.decision)).toEqual([
      "stay",
      "stay",
      "stay",
      "relegate",
      "relegate",
    ]);
  });

  it("bottom tier: promote=2, relegate=0 → only the top two promote", () => {
    const decisions = planPromotions(
      input(
        [entrant(1), entrant(2), entrant(3), entrant(4), entrant(5)],
        2,
        0
      )
    );
    expect(decisions.map((d) => d.decision)).toEqual([
      "promote",
      "promote",
      "stay",
      "stay",
      "stay",
    ]);
  });

  it("middle tier with promote=2 + relegate=2 over 6 entrants — no ties", () => {
    const decisions = planPromotions(
      input(
        [entrant(1), entrant(2), entrant(3), entrant(4), entrant(5), entrant(6)],
        2,
        2
      )
    );
    expect(decisions.length).toBe(6);
    expect(decisions.filter((d) => d.decision === "promote").length).toBe(2);
    expect(decisions.filter((d) => d.decision === "relegate").length).toBe(2);
    expect(decisions.filter((d) => d.decision === "stay").length).toBe(2);
  });

  it("excludes withdrawn entrants from planning", () => {
    const entrants = [
      entrant(1),
      entrant(2),
      entrant(3, { status: "withdrawn" }),
      entrant(4),
    ];
    const decisions = planPromotions(input(entrants, 1, 1));
    expect(decisions.map((d) => d.entrantId)).toEqual(["e-1", "e-2", "e-4"]);
    expect(decisions[0]!.decision).toBe("promote");
    expect(decisions[2]!.decision).toBe("relegate");
  });

  it("tied at promotion boundary without override → throws TIE_AT_PROMOTION_BOUNDARY", () => {
    const entrants = [
      entrant(1),
      entrant(2, { isTiedWithNext: true }),
      entrant(3),
      entrant(4),
    ];
    expect(() => planPromotions(input(entrants, 2, 0))).toThrowError(
      PromotionPlannerError
    );
    try {
      planPromotions(input(entrants, 2, 0));
    } catch (e) {
      expect((e as PromotionPlannerError).kind).toBe(
        "TIE_AT_PROMOTION_BOUNDARY"
      );
      expect((e as PromotionPlannerError).details.entrantIds).toEqual([
        "e-2",
        "e-3",
      ]);
    }
  });

  it("tied at relegation boundary without override → throws TIE_AT_RELEGATION_BOUNDARY", () => {
    const entrants = [
      entrant(1),
      entrant(2),
      entrant(3, { isTiedWithNext: true }),
      entrant(4),
    ];
    expect(() => planPromotions(input(entrants, 0, 1))).toThrowError(
      PromotionPlannerError
    );
    try {
      planPromotions(input(entrants, 0, 1));
    } catch (e) {
      expect((e as PromotionPlannerError).kind).toBe(
        "TIE_AT_RELEGATION_BOUNDARY"
      );
    }
  });

  it("tied at promotion boundary, both overridden → returns valid decisions", () => {
    const entrants = [
      entrant(1),
      entrant(2, { isTiedWithNext: true }),
      entrant(3),
      entrant(4),
    ];
    const decisions = planPromotions(
      input(entrants, 2, 0, [
        ["e-2", { decision: "promote", note: "won the tiebreaker frame" }],
        ["e-3", { decision: "stay", note: "lost tiebreaker" }],
      ])
    );
    const e2 = decisions.find((d) => d.entrantId === "e-2")!;
    expect(e2.decision).toBe("promote");
    expect(e2.wasManualOverride).toBe(true);
    expect(e2.overrideNote).toBe("won the tiebreaker frame");
    const e3 = decisions.find((d) => d.entrantId === "e-3")!;
    expect(e3.decision).toBe("stay");
    expect(e3.wasManualOverride).toBe(true);
  });

  it("tied at non-boundary positions does NOT throw (irrelevant to promote/relegate)", () => {
    const entrants = [
      entrant(1),
      entrant(2),
      entrant(3, { isTiedWithNext: true }),
      entrant(4),
      entrant(5),
    ];
    // promote=2 → boundary at 2/3, ties at 3/4 don't matter.
    const decisions = planPromotions(input(entrants, 2, 0));
    expect(decisions.map((d) => d.decision)).toEqual([
      "promote",
      "promote",
      "stay",
      "stay",
      "stay",
    ]);
  });

  it("override for a non-existent entrant → throws INVALID_OVERRIDE_TARGET", () => {
    const entrants = [entrant(1), entrant(2)];
    try {
      planPromotions(
        input(entrants, 1, 0, [
          ["e-99", { decision: "promote", note: "ghost" }],
        ])
      );
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PromotionPlannerError);
      expect((e as PromotionPlannerError).kind).toBe("INVALID_OVERRIDE_TARGET");
    }
  });

  it("override creating a 3rd promotion when promoteCount=2 → throws CONFLICTING_OVERRIDES", () => {
    const entrants = [entrant(1), entrant(2), entrant(3), entrant(4)];
    try {
      planPromotions(
        input(entrants, 2, 0, [
          ["e-3", { decision: "promote", note: "manager call" }],
        ])
      );
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PromotionPlannerError);
      expect((e as PromotionPlannerError).kind).toBe("CONFLICTING_OVERRIDES");
    }
  });

  it("override removing a relegation without compensating override → throws CONFLICTING_OVERRIDES", () => {
    const entrants = [entrant(1), entrant(2), entrant(3), entrant(4)];
    try {
      planPromotions(
        input(entrants, 0, 1, [
          ["e-4", { decision: "stay", note: "exception this season" }],
        ])
      );
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PromotionPlannerError);
      expect((e as PromotionPlannerError).kind).toBe("CONFLICTING_OVERRIDES");
    }
  });

  it("override swapping two adjacent positions (promote ↔ stay) → balances out", () => {
    const entrants = [
      entrant(1),
      entrant(2),
      entrant(3, { isTiedWithNext: true }),
      entrant(4),
    ];
    // Override the natural promote (pos 2) to stay AND pos 3 to promote.
    const decisions = planPromotions(
      input(entrants, 2, 0, [
        ["e-2", { decision: "stay", note: "swap" }],
        ["e-3", { decision: "promote", note: "swap" }],
      ])
    );
    const e2 = decisions.find((d) => d.entrantId === "e-2")!;
    const e3 = decisions.find((d) => d.entrantId === "e-3")!;
    expect(e2.decision).toBe("stay");
    expect(e3.decision).toBe("promote");
  });

  it("empty entrant list returns empty array", () => {
    const decisions = planPromotions(input([], 0, 0));
    expect(decisions).toEqual([]);
  });

  it("handles promoteCount + relegateCount > totalEntrants without overlap", () => {
    // 3 entrants, promote=2, relegate=2 — relegate slot starts at max(2, 1) = 2.
    const entrants = [entrant(1), entrant(2), entrant(3)];
    const decisions = planPromotions(input(entrants, 2, 2));
    expect(decisions.map((d) => d.decision)).toEqual([
      "promote",
      "promote",
      "relegate",
    ]);
  });

  it("is deterministic — same input twice returns identical output", () => {
    const entrants = [
      entrant(1),
      entrant(2),
      entrant(3),
      entrant(4),
      entrant(5),
      entrant(6),
    ];
    const a = planPromotions(input(entrants, 2, 2));
    const b = planPromotions(input(entrants, 2, 2));
    expect(a).toEqual(b);
  });
});
