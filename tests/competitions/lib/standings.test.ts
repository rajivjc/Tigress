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

describe("computeStandings — S24a galas + byes", () => {
  function pairing(home: string, away: string, winners: (string | null)[]) {
    return {
      homeEntrantId: home,
      awayEntrantId: away,
      subMatches: winners.map((w, i) => ({
        matchId: `${home}-${away}-${i}`,
        sideA: { entrantId: home },
        sideB: { entrantId: away },
        winnerEntrantId: w,
      })),
    };
  }

  it("bye fixture contributes nothing to either team's row", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b")],
      fixtures: [
        {
          id: "bye-1",
          homeEntrantId: null,
          awayEntrantId: null,
          status: "completed",
          isBye: true,
          subMatches: [],
        },
        makeFixture("fx-1", "a", "b", [{ winner: "a" }]),
      ],
    });
    expect(rows.find((r) => r.entrantId === "a")!.played).toBe(1);
    expect(rows.find((r) => r.entrantId === "b")!.played).toBe(1);
  });

  it("gala fixture with 4 participants and all 6 pairings completed", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b"), E("c"), E("d")],
      fixtures: [
        {
          id: "gala-1",
          homeEntrantId: null,
          awayEntrantId: null,
          status: "completed",
          subMatches: [],
          pairings: [
            pairing("a", "b", ["a", "a", "b"]),
            pairing("a", "c", ["a", "a", "a"]),
            pairing("a", "d", ["a", "d", "d"]),
            pairing("b", "c", ["b", "c", "c"]),
            pairing("b", "d", ["b", "b", "d"]),
            pairing("c", "d", ["c", "c", "c"]),
          ],
        },
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    expect(a.played).toBe(3);
    expect(a.won).toBe(2); // beat b (2-1), beat c (3-0), lost to d (1-2)
    expect(a.lost).toBe(1);
    expect(a.points).toBe(6);
    const c = rows.find((r) => r.entrantId === "c")!;
    expect(c.played).toBe(3);
    expect(c.won).toBe(2); // lost to a (0-3), beat b (2-1), beat d (3-0)
  });

  it("mixed regular fixtures + a gala fold into one set of standings", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        makeFixture("fx-1", "a", "b", [{ winner: "a" }, { winner: "a" }]),
        makeFixture("fx-2", "b", "c", [{ winner: "b" }, { winner: "c" }, { winner: "c" }]),
        {
          id: "gala-1",
          homeEntrantId: null,
          awayEntrantId: null,
          status: "completed",
          subMatches: [],
          pairings: [
            pairing("a", "c", ["c"]),
            pairing("b", "a", ["a"]),
          ],
        },
      ],
    });
    // a vs b (regular): a wins → a +3, b 0
    // b vs c (regular): c wins → c +3, b 0
    // gala a vs c: c wins → c +3, a 0
    // gala b vs a: a wins → a +3, b 0
    const a = rows.find((r) => r.entrantId === "a")!;
    expect(a.played).toBe(3);
    expect(a.won).toBe(2);
    expect(a.lost).toBe(1);
    expect(a.points).toBe(6);
    const c = rows.find((r) => r.entrantId === "c")!;
    expect(c.played).toBe(2);
    expect(c.won).toBe(2);
    expect(c.points).toBe(6);
    const b = rows.find((r) => r.entrantId === "b")!;
    expect(b.played).toBe(3);
    expect(b.points).toBe(0);
  });

  it("partially-completed gala — only reported pairings contribute", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b"), E("c"), E("d")],
      fixtures: [
        {
          id: "gala-1",
          homeEntrantId: null,
          awayEntrantId: null,
          status: "completed",
          subMatches: [],
          pairings: [
            pairing("a", "b", ["a"]),
            pairing("a", "c", ["a"]),
            pairing("a", "d", ["a"]),
            // 3 pairings without any reported winner — should be ignored
            pairing("b", "c", [null, null]),
            pairing("b", "d", [null]),
            pairing("c", "d", [null, null]),
          ],
        },
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    expect(a.played).toBe(3);
    expect(a.points).toBe(9);
    const b = rows.find((r) => r.entrantId === "b")!;
    expect(b.played).toBe(1); // only the loss to a
    expect(b.lost).toBe(1);
    const c = rows.find((r) => r.entrantId === "c")!;
    expect(c.played).toBe(1);
    const d = rows.find((r) => r.entrantId === "d")!;
    expect(d.played).toBe(1);
  });

  it("manual gala with only 2 defined pairings — only those 2 contribute", () => {
    const rows = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b"), E("c"), E("d")],
      fixtures: [
        {
          id: "gala-manual",
          homeEntrantId: null,
          awayEntrantId: null,
          status: "completed",
          subMatches: [],
          pairings: [
            pairing("a", "b", ["a"]),
            pairing("c", "d", ["c"]),
          ],
        },
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    expect(a.played).toBe(1);
    const b = rows.find((r) => r.entrantId === "b")!;
    expect(b.played).toBe(1);
    const c = rows.find((r) => r.entrantId === "c")!;
    expect(c.played).toBe(1);
    const d = rows.find((r) => r.entrantId === "d")!;
    expect(d.played).toBe(1);
    // Total games across all entrants = 2 fixtures × 2 sides = 4
    const totalPlayed = rows.reduce((sum, r) => sum + r.played, 0);
    expect(totalPlayed).toBe(4);
  });

  it("shuffled fixture order produces identical standings (determinism)", () => {
    const fixtures = [
      makeFixture("fx-1", "a", "b", [{ winner: "a" }]),
      makeFixture("fx-2", "b", "c", [{ winner: "b" }]),
      {
        id: "gala-1",
        homeEntrantId: null,
        awayEntrantId: null,
        status: "completed" as const,
        subMatches: [],
        pairings: [
          pairing("a", "c", ["a"]),
          pairing("b", "a", ["b"]),
        ],
      },
    ];
    const a = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b"), E("c")],
      fixtures,
    });
    const b = computeStandings({
      config: cfg(),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [fixtures[2]!, fixtures[0]!, fixtures[1]!],
    });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
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

  it("throws on win_loss points rule when tied_sub_matches is missing", () => {
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

  it("throws on per_sub_match points rule when sub_match_win_points is missing", () => {
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

  it("accepts loose lineup rule (S24b1)", () => {
    expect(() =>
      validateLeagueConfigSupported(
        cfg({
          lineup: { rule: "loose", allow_player_in_multiple_slots: false },
        })
      )
    ).not.toThrow();
  });

  it("accepts sub_with_approval lineup rule (S24b1)", () => {
    expect(() =>
      validateLeagueConfigSupported(
        cfg({
          lineup: {
            rule: "sub_with_approval",
            allow_player_in_multiple_slots: false,
          },
        })
      )
    ).not.toThrow();
  });

  it("accepts sub_matches_won tiebreaker (S24b1)", () => {
    expect(() =>
      validateLeagueConfigSupported(
        cfg({ tiebreakers: ["sub_matches_won"] })
      )
    ).not.toThrow();
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

  it("throws on per_sub_match when sub_match_win_points is negative", () => {
    expect(() =>
      validateLeagueConfigSupported(
        cfg({
          points: {
            rule: "per_sub_match",
            win_points: 0,
            draw_points: 0,
            loss_points: 0,
            sub_match_win_points: -1,
          },
        })
      )
    ).toThrowError(LeagueConfigNotImplementedError);
  });

  it("throws on unsupported tiebreaker name", () => {
    expect(() =>
      validateLeagueConfigSupported(
        cfg({
          tiebreakers: [
            "head_to_head",
            "made_up_metric" as unknown as "frame_diff",
          ],
        })
      )
    ).toThrowError(LeagueConfigNotImplementedError);
  });
});

// =============================================================================
// S24b1 — alternative points configs
// =============================================================================

describe("computeStandings — win_loss points", () => {
  function winLoss(
    tied: "home_wins" | "away_wins" | "replay_required",
    win = 2,
    loss = 0
  ) {
    return cfg({
      points: {
        rule: "win_loss",
        win_points: win,
        draw_points: 0,
        loss_points: loss,
        tied_sub_matches: tied,
      },
    });
  }

  it("home wins via sub-match count → standard win/loss points", () => {
    const rows = computeStandings({
      config: winLoss("home_wins"),
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
    expect(a.points).toBe(2);
    expect(b.points).toBe(0);
    expect(a.won).toBe(1);
    expect(b.lost).toBe(1);
  });

  it("tied sub-matches → home_wins resolution", () => {
    const rows = computeStandings({
      config: winLoss("home_wins"),
      entrants: [E("a"), E("b")],
      fixtures: [
        makeFixture("fx1", "a", "b", [{ winner: "a" }, { winner: "b" }]),
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    const b = rows.find((r) => r.entrantId === "b")!;
    expect(a.points).toBe(2);
    expect(b.points).toBe(0);
    expect(a.won).toBe(1);
    expect(b.lost).toBe(1);
    expect(a.drawn).toBe(0);
  });

  it("tied sub-matches → away_wins resolution", () => {
    const rows = computeStandings({
      config: winLoss("away_wins"),
      entrants: [E("a"), E("b")],
      fixtures: [
        makeFixture("fx1", "a", "b", [{ winner: "a" }, { winner: "b" }]),
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    const b = rows.find((r) => r.entrantId === "b")!;
    expect(a.points).toBe(0);
    expect(b.points).toBe(2);
    expect(b.won).toBe(1);
    expect(a.lost).toBe(1);
    expect(b.awayWins).toBe(1);
  });

  it("tied sub-matches → replay_required: fixture contributes nothing", () => {
    const rows = computeStandings({
      config: winLoss("replay_required"),
      entrants: [E("a"), E("b")],
      fixtures: [
        makeFixture("fx1", "a", "b", [{ winner: "a" }, { winner: "b" }]),
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    const b = rows.find((r) => r.entrantId === "b")!;
    expect(a.played).toBe(0);
    expect(b.played).toBe(0);
    expect(a.points).toBe(0);
    expect(b.points).toBe(0);
  });

  it("drawn counter never increments under win_loss", () => {
    const rows = computeStandings({
      config: winLoss("home_wins"),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        makeFixture("fx1", "a", "b", [{ winner: "a" }, { winner: "b" }]),
        makeFixture("fx2", "c", "a", [{ winner: "a" }]),
      ],
    });
    expect(rows.every((r) => r.drawn === 0)).toBe(true);
  });

  it("validation throws when tied_sub_matches is missing", () => {
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

  it("gala pairings with one tied pair under replay_required → that pair skipped, others count", () => {
    const rows = computeStandings({
      config: winLoss("replay_required"),
      entrants: [E("a"), E("b"), E("c"), E("d")],
      fixtures: [
        {
          id: "gala",
          homeEntrantId: null,
          awayEntrantId: null,
          status: "completed",
          subMatches: [],
          pairings: [
            // a vs b — tied → skipped
            {
              homeEntrantId: "a",
              awayEntrantId: "b",
              subMatches: [
                {
                  matchId: "ab-1",
                  sideA: { entrantId: "a" },
                  sideB: { entrantId: "b" },
                  winnerEntrantId: "a",
                },
                {
                  matchId: "ab-2",
                  sideA: { entrantId: "a" },
                  sideB: { entrantId: "b" },
                  winnerEntrantId: "b",
                },
              ],
            },
            // c vs d — c wins clearly
            {
              homeEntrantId: "c",
              awayEntrantId: "d",
              subMatches: [
                {
                  matchId: "cd-1",
                  sideA: { entrantId: "c" },
                  sideB: { entrantId: "d" },
                  winnerEntrantId: "c",
                },
                {
                  matchId: "cd-2",
                  sideA: { entrantId: "c" },
                  sideB: { entrantId: "d" },
                  winnerEntrantId: "c",
                },
              ],
            },
          ],
        },
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    const c = rows.find((r) => r.entrantId === "c")!;
    expect(a.played).toBe(0); // tied pair skipped
    expect(c.played).toBe(1);
    expect(c.points).toBe(2);
  });
});

describe("computeStandings — per_sub_match points", () => {
  function perSub(pts: number) {
    return cfg({
      points: {
        rule: "per_sub_match",
        win_points: 0,
        draw_points: 0,
        loss_points: 0,
        sub_match_win_points: pts,
      },
    });
  }

  it("3 sub-matches, 2 won by home → home gets 2× sub_match_win_points, away gets 1×", () => {
    const rows = computeStandings({
      config: perSub(1),
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
    expect(a.points).toBe(2);
    expect(b.points).toBe(1);
    expect(a.subMatchesWon).toBe(2);
    expect(b.subMatchesWon).toBe(1);
  });

  it("unreported sub-match contributes zero", () => {
    const rows = computeStandings({
      config: perSub(3),
      entrants: [E("a"), E("b")],
      fixtures: [
        makeFixture("fx1", "a", "b", [
          { winner: "a" },
          { winner: null },
          { winner: "b" },
        ]),
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    const b = rows.find((r) => r.entrantId === "b")!;
    expect(a.points).toBe(3);
    expect(b.points).toBe(3);
  });

  it("won/drawn/lost all zero across the season", () => {
    const rows = computeStandings({
      config: perSub(2),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        makeFixture("fx1", "a", "b", [{ winner: "a" }, { winner: "a" }]),
        makeFixture("fx2", "b", "c", [{ winner: "b" }, { winner: "c" }]),
      ],
    });
    for (const row of rows) {
      expect(row.won).toBe(0);
      expect(row.drawn).toBe(0);
      expect(row.lost).toBe(0);
    }
  });

  it("validation throws when sub_match_win_points is missing", () => {
    expect(() =>
      validateLeagueConfigSupported(
        cfg({
          points: {
            rule: "per_sub_match",
            win_points: 0,
            draw_points: 0,
            loss_points: 0,
          },
        })
      )
    ).toThrowError(LeagueConfigNotImplementedError);
  });

  it("validation throws when sub_match_win_points is negative", () => {
    expect(() =>
      validateLeagueConfigSupported(
        cfg({
          points: {
            rule: "per_sub_match",
            win_points: 0,
            draw_points: 0,
            loss_points: 0,
            sub_match_win_points: -2,
          },
        })
      )
    ).toThrowError(LeagueConfigNotImplementedError);
  });

  it("head_to_head tiebreaker sums sub-match points correctly", () => {
    const rows = computeStandings({
      config: perSub(1),
      entrants: [E("a"), E("b")],
      fixtures: [
        // a beats b 2-1 in first fixture, b beats a 2-1 in second → tied 3-3
        // total. h2h between a-b is 3 each, so falls through to alphabetic.
        makeFixture("fx1", "a", "b", [
          { winner: "a" },
          { winner: "a" },
          { winner: "b" },
        ]),
        makeFixture("fx2", "b", "a", [
          { winner: "b" },
          { winner: "b" },
          { winner: "a" },
        ]),
      ],
    });
    expect(rows[0]!.points).toBe(3);
    expect(rows[1]!.points).toBe(3);
    // Alphabetic fall-through after a tied head-to-head.
    expect(rows[0]!.entrantId).toBe("a");
  });

  it("gala pairings expand correctly with sub-match scoring", () => {
    const rows = computeStandings({
      config: perSub(1),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        {
          id: "gala-1",
          homeEntrantId: null,
          awayEntrantId: null,
          status: "completed",
          subMatches: [],
          pairings: [
            {
              homeEntrantId: "a",
              awayEntrantId: "b",
              subMatches: [
                {
                  matchId: "ab-1",
                  sideA: { entrantId: "a" },
                  sideB: { entrantId: "b" },
                  winnerEntrantId: "a",
                },
                {
                  matchId: "ab-2",
                  sideA: { entrantId: "a" },
                  sideB: { entrantId: "b" },
                  winnerEntrantId: "b",
                },
              ],
            },
            {
              homeEntrantId: "a",
              awayEntrantId: "c",
              subMatches: [
                {
                  matchId: "ac-1",
                  sideA: { entrantId: "a" },
                  sideB: { entrantId: "c" },
                  winnerEntrantId: "c",
                },
              ],
            },
          ],
        },
      ],
    });
    const a = rows.find((r) => r.entrantId === "a")!;
    const b = rows.find((r) => r.entrantId === "b")!;
    const c = rows.find((r) => r.entrantId === "c")!;
    // a: 1 sub-win (vs b) + 0 (vs c) = 1
    // b: 1 sub-win (vs a) = 1
    // c: 1 sub-win (vs a) = 1
    expect(a.points).toBe(1);
    expect(b.points).toBe(1);
    expect(c.points).toBe(1);
  });
});

// =============================================================================
// S24b1 — tiebreakers
// =============================================================================

describe("computeStandings — tiebreakers (S24b1)", () => {
  function makeFx(
    id: string,
    home: string,
    away: string,
    submatches: Array<{ winner: string | null; scoreA?: number; scoreB?: number }>,
    status: "completed" | "scheduled" = "completed"
  ) {
    return {
      id,
      homeEntrantId: home,
      awayEntrantId: away,
      status,
      subMatches: submatches.map((s, i) => ({
        matchId: `${id}-m${i}`,
        sideA: { entrantId: home },
        sideB: { entrantId: away },
        winnerEntrantId: s.winner,
        scoreA: s.scoreA,
        scoreB: s.scoreB,
      })),
    };
  }

  it("sub_matches_won — more is better", () => {
    const rows = computeStandings({
      config: cfg({
        tiebreakers: ["sub_matches_won"],
      }),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        // a vs c: a wins 3-0 → a +3, c 0
        makeFx("fx1", "a", "c", [
          { winner: "a" },
          { winner: "a" },
          { winner: "a" },
        ]),
        // b vs c: b wins 2-1 → b +3, c 0
        makeFx("fx2", "b", "c", [
          { winner: "b" },
          { winner: "b" },
          { winner: "c" },
        ]),
      ],
    });
    // a and b both 3 pts. a has 3 sub-wins, b has 2. a should rank above b.
    expect(rows[0]!.entrantId).toBe("a");
    expect(rows[1]!.entrantId).toBe("b");
  });

  it("sub_matches_lost — fewer is better", () => {
    const rows = computeStandings({
      config: cfg({
        tiebreakers: ["sub_matches_lost"],
      }),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        makeFx("fx1", "a", "c", [
          { winner: "a" },
          { winner: "a" },
          { winner: "a" },
        ]),
        makeFx("fx2", "b", "c", [
          { winner: "b" },
          { winner: "b" },
          { winner: "c" },
        ]),
      ],
    });
    // a lost 0, b lost 1. a wins on fewer-losses tiebreak.
    expect(rows[0]!.entrantId).toBe("a");
    expect(rows[1]!.entrantId).toBe("b");
  });

  it("frame_diff — uses scoreA/scoreB", () => {
    const rows = computeStandings({
      config: cfg({
        tiebreakers: ["frame_diff"],
      }),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        // a beats c 5-0 frames (1 sub-match)
        makeFx("fx1", "a", "c", [{ winner: "a", scoreA: 5, scoreB: 0 }]),
        // b beats c 5-4 frames
        makeFx("fx2", "b", "c", [{ winner: "b", scoreA: 5, scoreB: 4 }]),
      ],
    });
    // a +5 frame diff, b +1 → a above b.
    expect(rows[0]!.entrantId).toBe("a");
    expect(rows[1]!.entrantId).toBe("b");
  });

  it("frames_won — more is better", () => {
    const rows = computeStandings({
      config: cfg({ tiebreakers: ["frames_won"] }),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        makeFx("fx1", "a", "c", [{ winner: "a", scoreA: 7, scoreB: 0 }]),
        makeFx("fx2", "b", "c", [{ winner: "b", scoreA: 5, scoreB: 0 }]),
      ],
    });
    expect(rows[0]!.entrantId).toBe("a");
    expect(rows[1]!.entrantId).toBe("b");
  });

  it("frames_lost — fewer is better", () => {
    const rows = computeStandings({
      config: cfg({ tiebreakers: ["frames_lost"] }),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        makeFx("fx1", "a", "c", [{ winner: "a", scoreA: 5, scoreB: 0 }]),
        makeFx("fx2", "b", "c", [{ winner: "b", scoreA: 5, scoreB: 4 }]),
      ],
    });
    // a lost 0 frames, b lost 4. a above b.
    expect(rows[0]!.entrantId).toBe("a");
    expect(rows[1]!.entrantId).toBe("b");
  });

  it("away_wins — only counts wins as the away team", () => {
    const rows = computeStandings({
      config: cfg({ tiebreakers: ["away_wins"] }),
      entrants: [E("a"), E("b"), E("c"), E("d")],
      fixtures: [
        // a wins as away vs c
        makeFx("fx1", "c", "a", [
          { winner: "a" },
          { winner: "a" },
          { winner: "a" },
        ]),
        // b wins as home vs d
        makeFx("fx2", "b", "d", [
          { winner: "b" },
          { winner: "b" },
          { winner: "b" },
        ]),
      ],
    });
    // Both a and b have 3 pts. a has 1 away win, b has 0.
    expect(rows[0]!.entrantId).toBe("a");
    expect(rows[1]!.entrantId).toBe("b");
  });

  it("wins — counts fixture-level wins", () => {
    const rows = computeStandings({
      config: cfg({
        tiebreakers: ["wins"],
        points: {
          rule: "win_draw_loss",
          win_points: 3,
          draw_points: 3,
          loss_points: 0,
        },
      }),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        // a wins fx1
        makeFx("fx1", "a", "c", [
          { winner: "a" },
          { winner: "a" },
          { winner: "a" },
        ]),
        // b draws fx2 (still gets 3 pts from this contrived config)
        makeFx("fx2", "b", "c", [{ winner: "b" }, { winner: "c" }]),
      ],
    });
    // a 3 pts (1 win), b 3 pts (1 draw). a's wins=1 vs b's wins=0.
    expect(rows[0]!.entrantId).toBe("a");
    expect(rows[1]!.entrantId).toBe("b");
  });

  it("draws — counts fixture-level draws", () => {
    // Two teams (a, b) tied on points but only one has the draws — and we
    // need them on the SAME points total. Easiest: a contrived 1-pt-per-
    // draw and 1-pt-per-win config where both teams played twice.
    const rows = computeStandings({
      config: cfg({
        tiebreakers: ["draws"],
        points: {
          rule: "win_draw_loss",
          win_points: 1,
          draw_points: 1,
          loss_points: 0,
        },
      }),
      entrants: [E("a"), E("b"), E("c"), E("d")],
      fixtures: [
        // a beats c, then loses to d → 1 pt total, 0 draws
        makeFx("fx1", "a", "c", [{ winner: "a" }]),
        makeFx("fx2", "a", "d", [{ winner: "d" }]),
        // b draws with both c and d → ... wait, that's 2 pts.
        // Use a single drawn fixture for b → 1 pt, 1 draw.
        makeFx("fx3", "b", "c", [{ winner: "b" }, { winner: "c" }]),
      ],
    });
    // a: 1 pt (1 win, 1 loss, 0 draws). b: 1 pt (1 draw). b > a on draws.
    const a = rows.find((r) => r.entrantId === "a")!;
    const b = rows.find((r) => r.entrantId === "b")!;
    expect(a.points).toBe(1);
    expect(b.points).toBe(1);
    expect(a.drawn).toBe(0);
    expect(b.drawn).toBe(1);
    expect(b.position).toBeLessThan(a.position);
  });

  it("missing scores → frame-based tiebreakers treat as zero on both sides", () => {
    const rows = computeStandings({
      config: cfg({ tiebreakers: ["frame_diff"] }),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        // No score data — just winners
        makeFx("fx1", "a", "c", [
          { winner: "a" },
          { winner: "a" },
          { winner: "a" },
        ]),
        makeFx("fx2", "b", "c", [
          { winner: "b" },
          { winner: "b" },
          { winner: "b" },
        ]),
      ],
    });
    // Both 3 pts, both 0 frame diff → fall through to alphabetic.
    expect(rows[0]!.entrantId).toBe("a");
    expect(rows[1]!.entrantId).toBe("b");
    expect(rows[0]!.frameDiff).toBe(0);
    expect(rows[1]!.frameDiff).toBe(0);
  });

  it("default tiebreaker chain applies when config tiebreakers is empty", () => {
    const rows = computeStandings({
      config: cfg({ tiebreakers: [] }),
      entrants: [E("a"), E("b"), E("c")],
      fixtures: [
        // h2h-cycle scenarios are noisy; this is just the alphabetic fall-through.
        makeFx("fx1", "a", "b", [{ winner: "a" }]),
        makeFx("fx2", "a", "c", [{ winner: "a" }]),
      ],
    });
    // a has 2 wins (6 pts), b and c are tied at 0 pts. The default chain
    // (head_to_head, sub_match_diff, sub_matches_won, frame_diff, frames_won)
    // can't separate them, so alphabetic decides: b above c.
    expect(rows[0]!.entrantId).toBe("a");
    expect(rows[1]!.entrantId).toBe("b");
    expect(rows[2]!.entrantId).toBe("c");
  });

  it("tiebreaker chaining: first two tied, third decides", () => {
    // Construct a scenario where head-to-head is tied (no direct match),
    // sub_match_diff is tied, but sub_matches_won decides.
    const rows = computeStandings({
      config: cfg({
        tiebreakers: ["head_to_head", "sub_match_diff", "sub_matches_won"],
      }),
      entrants: [E("a"), E("b"), E("c"), E("d"), E("e")],
      fixtures: [
        // a beats c 3-1 → a sub-win 3, sub-loss 1 (diff +2), 3 pts
        makeFx("fx1", "a", "c", [
          { winner: "a" },
          { winner: "a" },
          { winner: "a" },
          { winner: "c" },
        ]),
        // b beats d 2-0 → b sub-win 2, sub-loss 0 (diff +2), 3 pts
        makeFx("fx2", "b", "d", [{ winner: "b" }, { winner: "b" }]),
        // a and b never play each other → h2h tied at 0.
      ],
    });
    // a has 3 sub-wins, b has 2. So a wins on sub_matches_won.
    expect(rows[0]!.entrantId).toBe("a");
    expect(rows[1]!.entrantId).toBe("b");
  });
});
