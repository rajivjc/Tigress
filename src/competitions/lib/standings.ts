// =============================================================================
// Competitions — league standings (Session 23)
// =============================================================================
// Pure function. No DB, no React, no I/O. Takes a config + entrants + a
// fixture set with embedded sub-match results and returns one StandingsRow
// per entrant, sorted by points (configured tiebreakers after). The data
// layer's `getCompetitionStandings` wraps this with a real-mode loader.
//
// Only a narrow S23-supported config is actually computed; other values are
// stored at the DB layer but this function throws
// LeagueConfigNotImplementedError(feature) when asked to compute with them.
// The engine fills out in S24+.
// =============================================================================

import type { FixtureStatus, LeagueConfig } from "../types";

export interface StandingsRow {
  entrantId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  subMatchesWon: number;
  subMatchesLost: number;
  subMatchDiff: number;
  points: number;
  position: number;
}

export interface StandingsSubMatchInput {
  matchId: string;
  sideA: { entrantId: string };
  sideB: { entrantId: string };
  winnerEntrantId: string | null;
}

/**
 * One pairwise matchup inside a gala (S24a). Standings folds these the same
 * way as a 2-team fixture — galas are simply containers of pairings.
 */
export interface StandingsPairingInput {
  homeEntrantId: string;
  awayEntrantId: string;
  subMatches: StandingsSubMatchInput[];
}

export interface StandingsFixtureInput {
  id: string;
  homeEntrantId: string | null;
  awayEntrantId: string | null;
  status: FixtureStatus;
  /** S24a: bye fixtures contribute nothing. */
  isBye?: boolean;
  /** S24a: gala fixtures expand into multiple pairings. */
  pairings?: StandingsPairingInput[];
  subMatches: StandingsSubMatchInput[];
}

export interface ComputeStandingsInput {
  config: LeagueConfig;
  entrants: { id: string }[];
  fixtures: StandingsFixtureInput[];
}

export class LeagueConfigNotImplementedError extends Error {
  public readonly feature: string;
  constructor(feature: string) {
    super(`League config feature not implemented in S23: ${feature}`);
    this.name = "LeagueConfigNotImplementedError";
    this.feature = feature;
  }
}

/**
 * Validate the config against implemented features. Throws
 * `LeagueConfigNotImplementedError(feature)` on the first unsupported value.
 * Exported for the action layer so the create-league form can reject bad
 * configs before persisting.
 */
export function validateLeagueConfigSupported(config: LeagueConfig): void {
  if (config.version !== 1) {
    throw new LeagueConfigNotImplementedError(`version:${config.version}`);
  }
  if (config.fixture_format !== "flexible") {
    throw new LeagueConfigNotImplementedError(
      `fixture_format:${config.fixture_format}`
    );
  }
  if (config.home_away !== "tracked" && config.home_away !== "label_only") {
    throw new LeagueConfigNotImplementedError(`home_away:${config.home_away}`);
  }
  if (config.points.rule !== "win_draw_loss") {
    throw new LeagueConfigNotImplementedError(
      `points.rule:${config.points.rule}`
    );
  }
  if (config.lineup.rule !== "strict") {
    throw new LeagueConfigNotImplementedError(
      `lineup.rule:${config.lineup.rule}`
    );
  }
  for (const tb of config.tiebreakers) {
    if (tb !== "head_to_head" && tb !== "sub_match_diff") {
      throw new LeagueConfigNotImplementedError(`tiebreaker:${tb}`);
    }
  }
}

/**
 * Compute standings for the supported config. Throws
 * `LeagueConfigNotImplementedError` for any unsupported feature.
 *
 * Algorithm:
 *   1. Validate the config.
 *   2. Initialise a row per entrant with zeroes.
 *   3. For each fixture with status='completed', tally sub-match wins per
 *      side, award win/draw/loss points, increment sub-match counters.
 *   4. Sort by points desc, then each configured tiebreaker, then a stable
 *      alphabetic fall-through on entrant id.
 *   5. Stamp 1-based positions.
 */
export function computeStandings(
  input: ComputeStandingsInput
): StandingsRow[] {
  validateLeagueConfigSupported(input.config);

  const rows = new Map<string, StandingsRow>();
  for (const e of input.entrants) {
    rows.set(e.id, {
      entrantId: e.id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      subMatchesWon: 0,
      subMatchesLost: 0,
      subMatchDiff: 0,
      points: 0,
      position: 0,
    });
  }

  // Head-to-head lookup: keyed as `${a}|${b}` → points scored by `a`
  // against `b` (counted once per fixture). We only need this when the
  // head_to_head tiebreaker is active.
  const headToHead = new Map<string, number>();
  const h2hKey = (a: string, b: string) => `${a}|${b}`;

  // Normalise: galas expand into pairings, byes drop, 2-team fixtures pass
  // through. Gala pairings without ANY reported sub-match are skipped (the
  // gala is mid-tournament and that pair simply hasn't played yet); 2-team
  // fixtures keep their pre-S24a behaviour where a completed fixture with no
  // recorded winners counts as a 0-0 draw.
  type FoldablePair = {
    homeEntrantId: string;
    awayEntrantId: string;
    subMatches: StandingsSubMatchInput[];
    skipIfUnreported: boolean;
  };
  const foldable: FoldablePair[] = [];
  for (const fx of input.fixtures) {
    if (fx.status !== "completed") continue;
    if (fx.isBye) continue;
    if (fx.pairings && fx.pairings.length > 0) {
      for (const p of fx.pairings) {
        foldable.push({
          homeEntrantId: p.homeEntrantId,
          awayEntrantId: p.awayEntrantId,
          subMatches: p.subMatches,
          skipIfUnreported: true,
        });
      }
      continue;
    }
    if (fx.homeEntrantId === null || fx.awayEntrantId === null) continue;
    foldable.push({
      homeEntrantId: fx.homeEntrantId,
      awayEntrantId: fx.awayEntrantId,
      subMatches: fx.subMatches,
      skipIfUnreported: false,
    });
  }

  for (const pair of foldable) {
    const home = pair.homeEntrantId;
    const away = pair.awayEntrantId;
    const homeRow = rows.get(home);
    const awayRow = rows.get(away);
    if (!homeRow || !awayRow) continue;

    let homeSubWins = 0;
    let awaySubWins = 0;
    let anyReported = false;
    for (const sm of pair.subMatches) {
      if (sm.winnerEntrantId === null) continue;
      anyReported = true;
      if (sm.winnerEntrantId === home) homeSubWins += 1;
      else if (sm.winnerEntrantId === away) awaySubWins += 1;
    }
    if (pair.skipIfUnreported && !anyReported) continue;

    homeRow.played += 1;
    awayRow.played += 1;
    homeRow.subMatchesWon += homeSubWins;
    homeRow.subMatchesLost += awaySubWins;
    awayRow.subMatchesWon += awaySubWins;
    awayRow.subMatchesLost += homeSubWins;

    let homePts: number;
    let awayPts: number;
    if (homeSubWins > awaySubWins) {
      homeRow.won += 1;
      awayRow.lost += 1;
      homePts = input.config.points.win_points;
      awayPts = input.config.points.loss_points;
    } else if (awaySubWins > homeSubWins) {
      awayRow.won += 1;
      homeRow.lost += 1;
      homePts = input.config.points.loss_points;
      awayPts = input.config.points.win_points;
    } else {
      homeRow.drawn += 1;
      awayRow.drawn += 1;
      homePts = input.config.points.draw_points;
      awayPts = input.config.points.draw_points;
    }
    homeRow.points += homePts;
    awayRow.points += awayPts;

    headToHead.set(
      h2hKey(home, away),
      (headToHead.get(h2hKey(home, away)) ?? 0) + homePts
    );
    headToHead.set(
      h2hKey(away, home),
      (headToHead.get(h2hKey(away, home)) ?? 0) + awayPts
    );
  }

  for (const row of rows.values()) {
    row.subMatchDiff = row.subMatchesWon - row.subMatchesLost;
  }

  const sorted = Array.from(rows.values()).sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    for (const tb of input.config.tiebreakers) {
      if (tb === "head_to_head") {
        const aVsB = headToHead.get(h2hKey(a.entrantId, b.entrantId)) ?? 0;
        const bVsA = headToHead.get(h2hKey(b.entrantId, a.entrantId)) ?? 0;
        if (aVsB !== bVsA) return bVsA - aVsB;
      } else if (tb === "sub_match_diff") {
        if (a.subMatchDiff !== b.subMatchDiff) {
          return b.subMatchDiff - a.subMatchDiff;
        }
      }
      // sub_matches_won rejected by validateLeagueConfigSupported in S23.
    }
    // Stable fall-through on id so ordering is deterministic.
    return a.entrantId.localeCompare(b.entrantId);
  });

  sorted.forEach((row, i) => {
    row.position = i + 1;
  });
  return sorted;
}

/**
 * Default supported config with 3-1-0 points, strict lineup, and two-slot
 * tiebreaker chain. Used by the "Use default config" button on the create
 * league form and by several tests.
 */
export function defaultSupportedLeagueConfig(
  subMatchSlots: LeagueConfig["sub_match_slots"]
): LeagueConfig {
  return {
    version: 1,
    fixture_format: "flexible",
    home_away: "tracked",
    points: {
      rule: "win_draw_loss",
      win_points: 3,
      draw_points: 1,
      loss_points: 0,
    },
    lineup: {
      rule: "strict",
      allow_player_in_multiple_slots: false,
    },
    sub_match_slots: subMatchSlots,
    tiebreakers: ["head_to_head", "sub_match_diff"],
  };
}
