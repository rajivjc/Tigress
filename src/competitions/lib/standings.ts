// =============================================================================
// Competitions — league standings (S23, extended in S24b1)
// =============================================================================
// Pure function. No DB, no React, no I/O. Takes a config + entrants + a
// fixture set with embedded sub-match results and returns one StandingsRow
// per entrant, sorted by points (configured tiebreakers after). The data
// layer's `getCompetitionStandings` wraps this with a real-mode loader.
//
// Supported config (S24b1):
//   * fixture_format: "flexible"
//   * home_away:      "tracked" | "label_only"
//   * points.rule:    "win_draw_loss" | "win_loss" | "per_sub_match"
//   * lineup.rule:    "strict" | "loose" | "sub_with_approval"
//   * tiebreakers:    head_to_head, sub_match_diff, sub_matches_won,
//                     sub_matches_lost, frame_diff, frames_won, frames_lost,
//                     away_wins, wins, draws
//
// Anything else throws LeagueConfigNotImplementedError(feature) and the
// loader surfaces the message — the engine fills out further in S24b2+.
// =============================================================================

import type {
  FixtureStatus,
  LeagueConfig,
  LeagueConfigPoints,
  LeagueTiebreaker,
} from "../types";

export interface StandingsRow {
  entrantId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  subMatchesWon: number;
  subMatchesLost: number;
  subMatchDiff: number;
  /** S24b1: frame-level scores threaded from match_results.score_a/b. */
  framesWon: number;
  framesLost: number;
  frameDiff: number;
  /** S24b1: count of fixture / pairing wins played as the away side. */
  awayWins: number;
  points: number;
  position: number;
}

export interface StandingsSubMatchInput {
  matchId: string;
  sideA: { entrantId: string };
  sideB: { entrantId: string };
  winnerEntrantId: string | null;
  /** S24b1: frame counts. Optional — when either is missing, frame-based
   *  tiebreakers treat this sub-match as contributing zero on both sides. */
  scoreA?: number;
  scoreB?: number;
}

/**
 * One pairwise matchup inside a gala (S24a). Standings folds these the same
 * way as a 2-team fixture — galas are simply containers of pairings.
 */
export interface StandingsPairingInput {
  /** S24b1-fix: pass the pairing id through so replay-required can identify
   *  the specific pairing rather than just flagging the whole gala. The pure
   *  standings function ignores it; only the loader's pre-pass uses it. */
  pairingId?: string;
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
    super(`League config feature not implemented: ${feature}`);
    this.name = "LeagueConfigNotImplementedError";
    this.feature = feature;
  }
}

const SUPPORTED_TIEBREAKERS: ReadonlySet<LeagueTiebreaker> = new Set<LeagueTiebreaker>([
  "head_to_head",
  "sub_match_diff",
  "sub_matches_won",
  "sub_matches_lost",
  "frame_diff",
  "frames_won",
  "frames_lost",
  "away_wins",
  "wins",
  "draws",
]);

const DEFAULT_TIEBREAKERS: LeagueTiebreaker[] = [
  "head_to_head",
  "sub_match_diff",
  "sub_matches_won",
  "frame_diff",
  "frames_won",
];

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
  validatePointsConfig(config.points);
  if (
    config.lineup.rule !== "strict" &&
    config.lineup.rule !== "loose" &&
    config.lineup.rule !== "sub_with_approval"
  ) {
    throw new LeagueConfigNotImplementedError(
      `lineup.rule:${config.lineup.rule}`
    );
  }
  for (const tb of config.tiebreakers) {
    if (!SUPPORTED_TIEBREAKERS.has(tb)) {
      throw new LeagueConfigNotImplementedError(`tiebreaker:${tb}`);
    }
  }
}

function validatePointsConfig(points: LeagueConfigPoints): void {
  if (
    points.rule !== "win_draw_loss" &&
    points.rule !== "win_loss" &&
    points.rule !== "per_sub_match"
  ) {
    throw new LeagueConfigNotImplementedError(`points.rule:${points.rule}`);
  }
  if (points.rule === "win_loss") {
    if (!points.tied_sub_matches) {
      throw new LeagueConfigNotImplementedError(
        "points.tied_sub_matches:missing"
      );
    }
    if (
      points.tied_sub_matches !== "home_wins" &&
      points.tied_sub_matches !== "away_wins" &&
      points.tied_sub_matches !== "replay_required"
    ) {
      throw new LeagueConfigNotImplementedError(
        `points.tied_sub_matches:${points.tied_sub_matches}`
      );
    }
  }
  if (points.rule === "per_sub_match") {
    if (
      points.sub_match_win_points === undefined ||
      points.sub_match_win_points === null
    ) {
      throw new LeagueConfigNotImplementedError(
        "points.sub_match_win_points:missing"
      );
    }
    if (points.sub_match_win_points < 0) {
      throw new LeagueConfigNotImplementedError(
        `points.sub_match_win_points:${points.sub_match_win_points}`
      );
    }
  }
}

interface FoldablePair {
  homeEntrantId: string;
  awayEntrantId: string;
  subMatches: StandingsSubMatchInput[];
  /** Whether this pair is a gala-style pairing (skip if no sub-match was
   *  reported) vs a 2-team fixture (a completed-but-empty fixture is a
   *  legitimate 0-0 draw under win_draw_loss). */
  skipIfUnreported: boolean;
  /** S24b1: gala pairings carry explicit home/away semantics from the
   *  pairing definition. Regular 2-team fixtures get true (the home side
   *  is always the home_entrant_id) and away_wins increments for the
   *  away_entrant_id when they win. */
  homeAwayMeaningful: boolean;
}

/**
 * Compute standings for the supported config. Throws
 * `LeagueConfigNotImplementedError` for any unsupported feature.
 *
 * Algorithm:
 *   1. Validate the config.
 *   2. Initialise a row per entrant with zeroes.
 *   3. For each fixture (or gala pairing) with status='completed',
 *      tally sub-match wins + frame counts per side, award points per the
 *      configured rule, increment counters.
 *   4. Sort by points desc, then each configured tiebreaker (or the
 *      default chain if none configured), then a stable alphabetic
 *      fall-through on entrant id.
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
      framesWon: 0,
      framesLost: 0,
      frameDiff: 0,
      awayWins: 0,
      points: 0,
      position: 0,
    });
  }

  // Head-to-head lookup: keyed as `${a}|${b}` → points scored by `a`
  // against `b` (counted once per fixture). We only need this when the
  // head_to_head tiebreaker is active, but it's cheap to track always.
  const headToHead = new Map<string, number>();
  const h2hKey = (a: string, b: string) => `${a}|${b}`;

  // Normalise: galas expand into pairings, byes drop, 2-team fixtures pass
  // through. Gala pairings without ANY reported sub-match are skipped (the
  // gala is mid-tournament and that pair simply hasn't played yet); 2-team
  // fixtures keep their pre-S24a behaviour where a completed fixture with no
  // recorded winners counts as a 0-0 draw under win_draw_loss.
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
          homeAwayMeaningful: true,
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
      homeAwayMeaningful: true,
    });
  }

  const rule = input.config.points.rule;
  const tiedRule = input.config.points.tied_sub_matches;
  const subMatchPts = input.config.points.sub_match_win_points ?? 0;

  for (const pair of foldable) {
    const home = pair.homeEntrantId;
    const away = pair.awayEntrantId;
    const homeRow = rows.get(home);
    const awayRow = rows.get(away);
    if (!homeRow || !awayRow) continue;

    let homeSubWins = 0;
    let awaySubWins = 0;
    let homeFrames = 0;
    let awayFrames = 0;
    let anyReported = false;
    for (const sm of pair.subMatches) {
      if (sm.scoreA !== undefined && sm.scoreB !== undefined) {
        homeFrames += sm.scoreA;
        awayFrames += sm.scoreB;
      }
      if (sm.winnerEntrantId === null) continue;
      anyReported = true;
      if (sm.winnerEntrantId === home) homeSubWins += 1;
      else if (sm.winnerEntrantId === away) awaySubWins += 1;
    }
    if (pair.skipIfUnreported && !anyReported) continue;

    // Per-sub-match points: each sub-match awards to its winner. Played
    // counters still increment per pair so the "P" column behaves
    // intuitively, but won/drawn/lost stay at zero — they don't apply.
    if (rule === "per_sub_match") {
      homeRow.played += 1;
      awayRow.played += 1;
      homeRow.subMatchesWon += homeSubWins;
      homeRow.subMatchesLost += awaySubWins;
      awayRow.subMatchesWon += awaySubWins;
      awayRow.subMatchesLost += homeSubWins;
      homeRow.framesWon += homeFrames;
      homeRow.framesLost += awayFrames;
      awayRow.framesWon += awayFrames;
      awayRow.framesLost += homeFrames;

      const homePts = homeSubWins * subMatchPts;
      const awayPts = awaySubWins * subMatchPts;
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
      // Per-sub-match has no fixture-level winner concept, so away_wins
      // simply tracks "did the away side score more sub-match wins?" — a
      // useful tiebreaker proxy.
      if (pair.homeAwayMeaningful && awaySubWins > homeSubWins) {
        awayRow.awayWins += 1;
      }
      continue;
    }

    // win_loss with replay_required: tied sub-matches mean the fixture
    // contributes nothing to standings. Surface the fixture id via the
    // loader's pre-pass so the UI can prompt for a replay.
    if (
      rule === "win_loss" &&
      tiedRule === "replay_required" &&
      homeSubWins === awaySubWins
    ) {
      continue;
    }

    homeRow.played += 1;
    awayRow.played += 1;
    homeRow.subMatchesWon += homeSubWins;
    homeRow.subMatchesLost += awaySubWins;
    awayRow.subMatchesWon += awaySubWins;
    awayRow.subMatchesLost += homeSubWins;
    homeRow.framesWon += homeFrames;
    homeRow.framesLost += awayFrames;
    awayRow.framesWon += awayFrames;
    awayRow.framesLost += homeFrames;

    let homePts: number;
    let awayPts: number;

    if (rule === "win_loss") {
      // Resolve the fixture-level outcome using the configured rule.
      let homeWon: boolean;
      if (homeSubWins > awaySubWins) {
        homeWon = true;
      } else if (awaySubWins > homeSubWins) {
        homeWon = false;
      } else {
        // tiedRule must be home_wins or away_wins here (replay_required is
        // handled above and home_wins/away_wins are the only other options
        // validated by validateLeagueConfigSupported).
        homeWon = tiedRule === "home_wins";
      }
      if (homeWon) {
        homeRow.won += 1;
        awayRow.lost += 1;
        homePts = input.config.points.win_points;
        awayPts = input.config.points.loss_points;
      } else {
        awayRow.won += 1;
        homeRow.lost += 1;
        homePts = input.config.points.loss_points;
        awayPts = input.config.points.win_points;
        if (pair.homeAwayMeaningful) awayRow.awayWins += 1;
      }
    } else {
      // win_draw_loss
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
        if (pair.homeAwayMeaningful) awayRow.awayWins += 1;
      } else {
        homeRow.drawn += 1;
        awayRow.drawn += 1;
        homePts = input.config.points.draw_points;
        awayPts = input.config.points.draw_points;
      }
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
    row.frameDiff = row.framesWon - row.framesLost;
  }

  const tiebreakers =
    input.config.tiebreakers.length > 0
      ? input.config.tiebreakers
      : DEFAULT_TIEBREAKERS;

  const sorted = Array.from(rows.values()).sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    for (const tb of tiebreakers) {
      const aVal = tieValue(a, tb, b.entrantId, headToHead);
      const bVal = tieValue(b, tb, a.entrantId, headToHead);
      if (aVal !== bVal) return bVal - aVal;
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
 * Return the comparable scalar for a tiebreaker. For `*_lost` options we
 * invert the sign so the standard "more is better" sort comparator
 * (`bVal - aVal`) ranks fewer losses higher.
 */
function tieValue(
  row: StandingsRow,
  tb: LeagueTiebreaker,
  opponentId: string,
  headToHead: Map<string, number>
): number {
  switch (tb) {
    case "head_to_head":
      return headToHead.get(`${row.entrantId}|${opponentId}`) ?? 0;
    case "sub_match_diff":
      return row.subMatchDiff;
    case "sub_matches_won":
      return row.subMatchesWon;
    case "sub_matches_lost":
      return -row.subMatchesLost;
    case "frame_diff":
      return row.frameDiff;
    case "frames_won":
      return row.framesWon;
    case "frames_lost":
      return -row.framesLost;
    case "away_wins":
      return row.awayWins;
    case "wins":
      return row.won;
    case "draws":
      return row.drawn;
  }
}

/**
 * Default supported config with 3-1-0 points, strict lineup, and the S24b1
 * default tiebreaker chain. Used by the "Use default config" button on the
 * create league form and by several tests.
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
