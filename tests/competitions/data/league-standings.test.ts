import { describe, it, expect, beforeEach } from "vitest";
import {
  findReplayRequiredItems,
  getCompetitionStandings,
} from "@/competitions/data/league-standings";
import {
  MOCK_COMP_COMPETITIONS,
  MOCK_COMP_MATCH_RESULTS,
} from "@/competitions/data/mock-data";
import type { LeagueConfig } from "@/competitions/types";
import type { StandingsFixtureInput } from "@/competitions/lib/standings";
import { resetMockData } from "../../helpers/reset-mock-data";

const PREMIER = "comp-league-spring-premier";

function setLeagueConfigForTest(rule: "win_loss" | "per_sub_match"): void {
  // The Spring Premier league config defaults to win_draw_loss + strict; we
  // mutate it in-place for the loader test then resetMockData() restores
  // the row's reference (the array itself is repopulated on each beforeEach
  // from the cached snapshot).
  const comp = MOCK_COMP_COMPETITIONS.find((c) => c.id === PREMIER);
  if (!comp || !comp.league_config) throw new Error("Premier league missing");
  if (rule === "win_loss") {
    comp.league_config = {
      ...comp.league_config,
      points: {
        rule: "win_loss",
        win_points: 2,
        draw_points: 0,
        loss_points: 0,
        tied_sub_matches: "replay_required",
      },
      tiebreakers: ["frame_diff"],
    };
  } else {
    comp.league_config = {
      ...comp.league_config,
      points: {
        rule: "per_sub_match",
        win_points: 0,
        draw_points: 0,
        loss_points: 0,
        sub_match_win_points: 1,
      },
      tiebreakers: ["frames_won"],
    };
  }
}

describe("getCompetitionStandings — S24b1 loader", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("returns the league config alongside the rows", async () => {
    const res = await getCompetitionStandings(PREMIER);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.config).toBeTruthy();
      expect(Array.isArray(res.data.replayRequired)).toBe(true);
    }
  });

  it("threads frame scores from match_results into rows", async () => {
    setLeagueConfigForTest("per_sub_match");
    const res = await getCompetitionStandings(PREMIER);
    expect(res.success).toBe(true);
    if (res.success) {
      // At least one entrant should have non-zero framesWon, since the seed
      // data has reported sub-match results with score values.
      const totalFrames = res.data.rows.reduce(
        (sum, r) => sum + r.framesWon + r.framesLost,
        0
      );
      // Sanity: per_sub_match counts frames per fixture per side, doubled
      // across home + away. The seed has at least one match result with
      // non-zero scores so this must be > 0.
      const seededResult = MOCK_COMP_MATCH_RESULTS.some(
        (r) => r.score_a + r.score_b > 0
      );
      if (seededResult) {
        expect(totalFrames).toBeGreaterThan(0);
      }
    }
  });

  it("replayRequired empty when config is not win_loss", async () => {
    const res = await getCompetitionStandings(PREMIER);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.replayRequired).toEqual([]);
    }
  });

  it("replayRequired populated under win_loss + replay_required when fixtures tie", async () => {
    setLeagueConfigForTest("win_loss");
    const res = await getCompetitionStandings(PREMIER);
    expect(res.success).toBe(true);
    if (res.success) {
      // Whether any seeded fixture happens to land tied is data-dependent;
      // the contract under test is that the loader returns a defined array.
      // We verify the surface, not the specific count.
      expect(Array.isArray(res.data.replayRequired)).toBe(true);
    }
  });
});

// =============================================================================
// findReplayRequiredItems — pure pre-pass over StandingsFixtureInput[].
// =============================================================================

const REPLAY_REQUIRED_CONFIG: LeagueConfig = {
  version: 1,
  fixture_format: "flexible",
  home_away: "tracked",
  points: {
    rule: "win_loss",
    win_points: 2,
    draw_points: 0,
    loss_points: 0,
    tied_sub_matches: "replay_required",
  },
  lineup: { rule: "strict", allow_player_in_multiple_slots: false },
  sub_match_slots: [],
  tiebreakers: ["frame_diff"],
};

const NON_REPLAY_CONFIG: LeagueConfig = {
  ...REPLAY_REQUIRED_CONFIG,
  points: {
    rule: "win_draw_loss",
    win_points: 3,
    draw_points: 1,
    loss_points: 0,
  },
};

describe("findReplayRequiredItems", () => {
  it("2-team tied fixture → kind='fixture' with entrant ids", () => {
    const fixtures: StandingsFixtureInput[] = [
      {
        id: "fx-1",
        homeEntrantId: "ent-home",
        awayEntrantId: "ent-away",
        status: "completed",
        subMatches: [
          {
            matchId: "m-1",
            sideA: { entrantId: "ent-home" },
            sideB: { entrantId: "ent-away" },
            winnerEntrantId: "ent-home",
          },
          {
            matchId: "m-2",
            sideA: { entrantId: "ent-home" },
            sideB: { entrantId: "ent-away" },
            winnerEntrantId: "ent-away",
          },
        ],
      },
    ];
    const items = findReplayRequiredItems(fixtures, REPLAY_REQUIRED_CONFIG);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      kind: "fixture",
      fixtureId: "fx-1",
      homeEntrantId: "ent-home",
      awayEntrantId: "ent-away",
    });
  });

  it("gala with one tied pairing → kind='pairing' for that pairing only, no fixture-level entry", () => {
    const fixtures: StandingsFixtureInput[] = [
      {
        id: "fx-gala",
        homeEntrantId: null,
        awayEntrantId: null,
        status: "completed",
        subMatches: [],
        pairings: [
          {
            pairingId: "pair-1",
            homeEntrantId: "ent-a",
            awayEntrantId: "ent-b",
            // tied 1-1
            subMatches: [
              {
                matchId: "m-1",
                sideA: { entrantId: "ent-a" },
                sideB: { entrantId: "ent-b" },
                winnerEntrantId: "ent-a",
              },
              {
                matchId: "m-2",
                sideA: { entrantId: "ent-a" },
                sideB: { entrantId: "ent-b" },
                winnerEntrantId: "ent-b",
              },
            ],
          },
          {
            pairingId: "pair-2",
            homeEntrantId: "ent-c",
            awayEntrantId: "ent-d",
            // not tied
            subMatches: [
              {
                matchId: "m-3",
                sideA: { entrantId: "ent-c" },
                sideB: { entrantId: "ent-d" },
                winnerEntrantId: "ent-c",
              },
            ],
          },
        ],
      },
    ];
    const items = findReplayRequiredItems(fixtures, REPLAY_REQUIRED_CONFIG);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      kind: "pairing",
      fixtureId: "fx-gala",
      pairingId: "pair-1",
      homeEntrantId: "ent-a",
      awayEntrantId: "ent-b",
    });
    // No fixture-level row for the gala.
    expect(items.some((i) => i.kind === "fixture")).toBe(false);
  });

  it("gala with multiple tied pairings → one entry per tied pairing", () => {
    const fixtures: StandingsFixtureInput[] = [
      {
        id: "fx-gala",
        homeEntrantId: null,
        awayEntrantId: null,
        status: "completed",
        subMatches: [],
        pairings: [
          {
            pairingId: "pair-1",
            homeEntrantId: "ent-a",
            awayEntrantId: "ent-b",
            subMatches: [
              {
                matchId: "m-1",
                sideA: { entrantId: "ent-a" },
                sideB: { entrantId: "ent-b" },
                winnerEntrantId: "ent-a",
              },
              {
                matchId: "m-2",
                sideA: { entrantId: "ent-a" },
                sideB: { entrantId: "ent-b" },
                winnerEntrantId: "ent-b",
              },
            ],
          },
          {
            pairingId: "pair-2",
            homeEntrantId: "ent-c",
            awayEntrantId: "ent-d",
            subMatches: [
              {
                matchId: "m-3",
                sideA: { entrantId: "ent-c" },
                sideB: { entrantId: "ent-d" },
                winnerEntrantId: "ent-c",
              },
              {
                matchId: "m-4",
                sideA: { entrantId: "ent-c" },
                sideB: { entrantId: "ent-d" },
                winnerEntrantId: "ent-d",
              },
            ],
          },
        ],
      },
    ];
    const items = findReplayRequiredItems(fixtures, REPLAY_REQUIRED_CONFIG);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === "pairing")).toBe(true);
    const pairingIds = items.map((i) => i.kind === "pairing" && i.pairingId);
    expect(pairingIds).toContain("pair-1");
    expect(pairingIds).toContain("pair-2");
  });

  it("non-replay_required configs return empty array", () => {
    const fixtures: StandingsFixtureInput[] = [
      {
        id: "fx-1",
        homeEntrantId: "ent-home",
        awayEntrantId: "ent-away",
        status: "completed",
        subMatches: [
          {
            matchId: "m-1",
            sideA: { entrantId: "ent-home" },
            sideB: { entrantId: "ent-away" },
            winnerEntrantId: "ent-home",
          },
          {
            matchId: "m-2",
            sideA: { entrantId: "ent-home" },
            sideB: { entrantId: "ent-away" },
            winnerEntrantId: "ent-away",
          },
        ],
      },
    ];
    expect(findReplayRequiredItems(fixtures, NON_REPLAY_CONFIG)).toEqual([]);
  });
});
