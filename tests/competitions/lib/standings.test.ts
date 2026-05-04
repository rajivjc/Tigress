import { describe, it, expect } from "vitest";
import {
  computeStandings,
  defaultSupportedLeagueConfig,
  LeagueConfigNotImplementedError,
  validateLeagueConfigSupported,
  type ComputeStandingsInput,
} from "@/competitions/lib/standings";
import type { LeagueConfig, TeamMatchSlot } from "@/competitions/types";

const SLOTS: TeamMatchSlot[] = [
  { id: "s1", kind: "singles", race_to: 5, sort_order: 1 },
  { id: "s2", kind: "singles", race_to: 5, sort_order: 2 },
  { id: "s3", kind: "singles", race_to: 5, sort_order: 3 },
];

function cfg(overrides: Partial<LeagueConfig> = {}): LeagueConfig {
  return { ...defaultSupportedLeagueConfig(SLOTS), ...overrides };
}

const E = (id: string) => ({ id });

function makeFixture(
  id: string,
  home: string,
  away: string,
  submatches: Array<{ winner: string | null; id?: string }>,
  status: "completed" | "scheduled" | "in_progress" = "completed"
) {
  return {
    id,
    homeEntrantId: home,
    awayEntrantId: away,
    status,
    subMatches: submatches.map((s, i) => ({
      matchId: s.id ?? `${id}-m${i}`,
      sideA: { entrantId: home },
      sideB: { entrantId: away },
      winnerEntrantId: s.winner,
    })),
  };
}

describe("computeStandings", () => {
  it("returns one row per entrant with zeros when no fixtures played", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b"), E("c"), E("d")],
      fixtures: [],
    });
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.points).toBe(0);
      expect(r.played).toBe(0);
      expect(r.won).toBe(0);
    }
  });

  it("awards 3 points for a win, 0 for a loss", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b")],
      fixtures: [
        makeFixture("fx1", "a", "b", [
          { winner: "a" },
          { winner: "a" },
          { winner: "b" },
        ]),
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    const b = rows.find((r) => r.entrantId === "b")!;
    expect(a.points).toBe(3);
    expect(b.points).toBe(0);
    expect(a.won).toBe(1);
    expect(b.lost).toBe(1);
  });

  it("awards 1 point each on a draw", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b")],
      fixtures: [
        makeFixture("fx1", "a", "b", [
          { winner: "a" },
          { winner: "b" },
          { winner: null },
        ]),
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    const b = rows.find((r) => r.entrantId === "b")!;
    expect(a.points).toBe(1);
    expect(b.points).toBe(1);
    expect(a.drawn).toBe(1);
    expect(b.drawn).toBe(1);
  });

  it("sub-match counters track wins + losses per side", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b")],
      fixtures: [
        makeFixture("fx1", "a", "b", [
          { winner: "a" },
          { winner: "a" },
          { winner: "b" },
        ]),
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    const b = rows.find((r) => r.entrantId === "b")!;
    expect(a.subMatchesWon).toBe(2);
    expect(a.subMatchesLost).toBe(1);
    expect(a.subMatchDiff).toBe(1);
    expect(b.subMatchesWon).toBe(1);
    expect(b.subMatchesLost).toBe(2);
    expect(b.subMatchDiff).toBe(-1);
  });

  it("ignores non-completed fixtures", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b")],
      fixtures: [
        makeFixture(
          "fx1",
          "a",
          "b",
          [{ winner: "a" }, { winner: "a" }, { winner: "a" }],
          "scheduled"
        ),
      ],
    });
    expect(rows.every((r) => r.played === 0)).toBe(true);
  });

  it("sorts by points desc", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        makeFixture("fx1", "a", "b", [
          { winner: "a" },
          { winner: "a" },
          { winner: "b" },
        ]),
        makeFixture("fx2", "c", "a", [
          { winner: "a" },
          { winner: "a" },
          { winner: "a" },
        ]),
      ],
    });
    expect(rows.map((r) => r.entrantId)).toEqual(["a", "b", "c"]);
    expect(rows[0]!.position).toBe(1);
  });

  it("head-to-head splits teams tied on points", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        // a beats b, b beats c, c beats a — everyone has 3 points.
        makeFixture("fx1", "a", "b", [
          { winner: "a" },
          { winner: "a" },
          { winner: "b" },
        ]),
        makeFixture("fx2", "b", "c", [
          { winner: "b" },
          { winner: "b" },
          { winner: "c" },
        ]),
        makeFixture("fx3", "c", "a", [
          { winner: "c" },
          { winner: "c" },
          { winner: "a" },
        ]),
      ],
    });
    // All 3 points; h2h is a cycle so head-to-head returns 0 — falls to
    // sub-match diff (all 0), then alphabetic.
    expect(rows.map((r) => r.entrantId)).toEqual(["a", "b", "c"]);
    expect(rows.every((r) => r.points === 3)).toBe(true);
  });

  it("head-to-head tiebreaker picks the fixture winner when two are tied", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        // a and b both beat c 3-0. But a beat b directly, so a places 1st.
        makeFixture("fx1", "a", "c", [
          { winner: "a" },
          { winner: "a" },
          { winner: "a" },
        ]),
        makeFixture("fx2", "b", "c", [
          { winner: "b" },
          { winner: "b" },
          { winner: "b" },
        ]),
        makeFixture("fx3", "a", "b", [
          { winner: "a" },
          { winner: "a" },
          { winner: "b" },
        ]),
      ],
    });
    expect(rows[0]!.entrantId).toBe("a");
    expect(rows[1]!.entrantId).toBe("b");
    expect(rows[2]!.entrantId).toBe("c");
  });

  it("sub-match diff resolves ties when head-to-head is level", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b"), E("c"), E("d")],
      fixtures: [
        // a and b have same points & didn't play each other. a crushed d 3-0,
        // b beat c 2-1. A should win on diff.
        makeFixture("fx1", "a", "d", [
          { winner: "a" },
          { winner: "a" },
          { winner: "a" },
        ]),
        makeFixture("fx2", "b", "c", [
          { winner: "b" },
          { winner: "b" },
          { winner: "c" },
        ]),
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    const b = rows.find((r) => r.entrantId === "b")!;
    expect(a.position).toBeLessThan(b.position);
  });

  it("fall-through alphabetic on entrant id is deterministic", () => {
    const first = computeStandings({
      config: cfg(),
      entrants: [E("z"), E("m"), E("a")],
      fixtures: [],
    });
    const second = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("z"), E("m")],
      fixtures: [],
    });
    expect(first.map((r) => r.entrantId)).toEqual(["a", "m", "z"]);
    expect(second.map((r) => r.entrantId)).toEqual(["a", "m", "z"]);
  });

  it("stamps 1-based contiguous positions", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [],
    });
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it("sums points across multiple fixtures", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b")],
      fixtures: [
        makeFixture("fx1", "a", "b", [
          { winner: "a" },
          { winner: "a" },
          { winner: "b" },
        ]),
        makeFixture("fx2", "b", "a", [
          { winner: "a" },
          { winner: "b" },
          { winner: null },
        ]),
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    expect(a.points).toBe(4); // 3 + 1
    expect(a.played).toBe(2);
    expect(a.won).toBe(1);
    expect(a.drawn).toBe(1);
  });

  it("positions reflect tiebreaker chain deterministically", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        makeFixture("fx1", "a", "b", [
          { winner: "a" },
          { winner: "a" },
          { winner: "b" },
        ]),
      ],
    });
    // a: 3 pts, b: 0 pts (diff -1), c: 0 pts (diff 0). Sub-match diff
    // tiebreaker places c above b even though c never played.
    expect(rows[0]!.entrantId).toBe("a");
    expect(rows[1]!.entrantId).toBe("c");
    expect(rows[2]!.entrantId).toBe("b");
  });

  it("winner=null on all sub-matches still counts as a fixture-level draw", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b")],
      fixtures: [
        makeFixture("fx1", "a", "b", [
          { winner: null },
          { winner: null },
          { winner: null },
        ]),
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    expect(a.drawn).toBe(1);
    expect(a.points).toBe(1);
  });

  it("produces identical output for identical input (determinism)", () => {
    const input: ComputeStandingsInput = {
      config: cfg(),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        makeFixture("fx1", "a", "b", [
          { winner: "a" },
          { winner: "b" },
          { winner: "a" },
        ]),
      ],
    };
    const first = computeStandings(input);
    const second = computeStandings(input);
    expect(JSON.stringify(first)).toEqual(JSON.stringify(second));
  });
});

describe("LeagueConfigNotImplementedError", () => {
  it("throws on round_robin_single fixture_format", () => {
    expect(() =>
      validateLeagueConfigSupported(cfg({ fixture_format: "round_robin_single" }))
    ).toThrowError(LeagueConfigNotImplementedError);
  });

  it("throws on round_robin_double fixture_format", () => {
    expect(() =>
      validateLeagueConfigSupported(cfg({ fixture_format: "round_robin_double" }))
    ).toThrowError(LeagueConfigNotImplementedError);
  });

  it("throws on win_loss points rule", () => {
    expect(() =>
      validateLeagueConfigSupported(
        cfg({
          points: {
            rule: "win_loss",
            win_points: 2,
            draw_points: 0,
            loss_points: 0,
          },
        })
      )
    ).toThrowError(LeagueConfigNotImplementedError);
  });

  it("throws on per_sub_match points rule", () => {
    expect(() =>
      validateLeagueConfigSupported(
        cfg({
          points: {
            rule: "per_sub_match",
            win_points: 1,
            draw_points: 0,
            loss_points: 0,
          },
        })
      )
    ).toThrowError(LeagueConfigNotImplementedError);
  });

  it("throws on loose lineup rule", () => {
    expect(() =>
      validateLeagueConfigSupported(
        cfg({
          lineup: { rule: "loose", allow_player_in_multiple_slots: false },
        })
      )
    ).toThrowError(LeagueConfigNotImplementedError);
  });

  it("throws on sub_with_approval lineup rule", () => {
    expect(() =>
      validateLeagueConfigSupported(
        cfg({
          lineup: {
            rule: "sub_with_approval",
            allow_player_in_multiple_slots: false,
          },
        })
      )
    ).toThrowError(LeagueConfigNotImplementedError);
  });

  it("throws on sub_matches_won tiebreaker", () => {
    expect(() =>
      validateLeagueConfigSupported(
        cfg({ tiebreakers: ["sub_matches_won"] })
      )
    ).toThrowError(LeagueConfigNotImplementedError);
  });

  it("error message includes the feature name", () => {
    try {
      validateLeagueConfigSupported(cfg({ fixture_format: "round_robin_single" }));
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LeagueConfigNotImplementedError);
      expect((err as LeagueConfigNotImplementedError).feature).toBe(
        "fixture_format:round_robin_single"
      );
    }
  });

  it("accepts the default supported config without throwing", () => {
    expect(() => validateLeagueConfigSupported(cfg())).not.toThrow();
  });

  it("accepts home_away: label_only as supported", () => {
    expect(() =>
      validateLeagueConfigSupported(cfg({ home_away: "label_only" }))
    ).not.toThrow();
  });

  it("throws on home_away: none", () => {
    expect(() =>
      validateLeagueConfigSupported(cfg({ home_away: "none" }))
    ).toThrowError(LeagueConfigNotImplementedError);
  });

  it("throws on version != 1", () => {
    const badConfig = { ...cfg(), version: 2 as unknown as 1 };
    expect(() => validateLeagueConfigSupported(badConfig)).toThrowError(
      LeagueConfigNotImplementedError
    );
  });

  it("computeStandings throws for unsupported configs", () => {
    expect(() =>
      computeStandings({
        config: cfg({ fixture_format: "round_robin_single" }),
        entrants: [E("a"), E("b")],
        fixtures: [],
      })
    ).toThrowError(LeagueConfigNotImplementedError);
  });
});
