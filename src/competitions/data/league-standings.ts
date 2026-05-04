// =============================================================================
// Competitions — league standings loader (S23, extended in S24b1)
// =============================================================================
// Thin wrapper around `lib/standings.ts::computeStandings`. Loads the
// competition, its entrants, its fixtures + sub-match results (with frame
// scores), and feeds them through the pure standings function. Also runs a
// pre-pass for `points.rule === 'win_loss'` configs that flags every fixture
// resulting in a tied sub-match count under `tied_sub_matches: 'replay_required'`
// — the league detail page surfaces this as a banner so organisers know which
// fixtures still need a replay before standings are final.
// =============================================================================

import "server-only";
import { listEntrants } from "./entrants";
import { getFixturesEnriched } from "./fixtures";
import { listPairingsByFixtureIds } from "./fixture-pairings";
import { getCompetition } from "./competitions";
import {
  computeStandings,
  type StandingsRow,
  type StandingsFixtureInput,
  type StandingsPairingInput,
  type StandingsSubMatchInput,
} from "../lib/standings";
import type { LeagueConfig } from "../types";

/**
 * Items the standings page needs to surface as "replay required". A gala
 * is identified at the pairing level (only the affected pairing replays);
 * a 2-team fixture is identified at the fixture level.
 */
export type ReplayRequiredItem =
  | {
      kind: "fixture";
      fixtureId: string;
      homeEntrantId: string;
      awayEntrantId: string;
    }
  | {
      kind: "pairing";
      fixtureId: string;
      pairingId: string;
      homeEntrantId: string;
      awayEntrantId: string;
    };

export interface CompetitionStandings {
  rows: StandingsRow[];
  config: LeagueConfig;
  /** Fixtures or gala pairings whose tied sub-match count means they don't
   *  contribute to standings under `points.tied_sub_matches: 'replay_required'`.
   *  Empty for any other config. */
  replayRequired: ReplayRequiredItem[];
}

export async function getCompetitionStandings(
  competitionId: string
): Promise<{ success: true; data: CompetitionStandings } | { success: false; error: string }> {
  const comp = await getCompetition(competitionId);
  if (!comp) return { success: false, error: "Competition not found" };
  if (comp.kind !== "league") {
    return { success: false, error: "Standings only apply to leagues" };
  }
  if (!comp.league_config) {
    return { success: false, error: "League is missing its config" };
  }

  const [entrants, fixtures] = await Promise.all([
    listEntrants(competitionId),
    getFixturesEnriched(competitionId),
  ]);

  // Galas: pairings link by team_id; build a team_id → entrant_id index
  // first so the pure standings function only ever sees entrant ids.
  const teamToEntrant = new Map<string, string>();
  for (const e of entrants) {
    if (e.entrant_team_id !== null) teamToEntrant.set(e.entrant_team_id, e.id);
  }

  const galaFixtureIds = fixtures
    .filter((fx) => fx.fixture.pairing_mode !== "two_team")
    .map((fx) => fx.fixture.id);
  const pairingsByFixture = await listPairingsByFixtureIds(galaFixtureIds);

  const fixtureInputs: StandingsFixtureInput[] = fixtures.map((fx) => {
    const subMatches: StandingsSubMatchInput[] = fx.subMatches
      .filter((m) => m.pairing_id === null)
      .map((m) => {
        const result = fx.results.find((r) => r.match_id === m.id);
        const aId = m.entrant_a_id;
        const bId = m.entrant_b_id;
        return {
          matchId: m.id,
          sideA: { entrantId: aId ?? "" },
          sideB: { entrantId: bId ?? "" },
          winnerEntrantId: result?.winner_entrant_id ?? null,
          scoreA: result?.score_a,
          scoreB: result?.score_b,
        };
      });

    let pairings: StandingsPairingInput[] | undefined;
    if (fx.fixture.pairing_mode !== "two_team") {
      const pairingRows = pairingsByFixture.get(fx.fixture.id) ?? [];
      pairings = pairingRows
        .map((p): StandingsPairingInput | null => {
          const homeEntrantId = teamToEntrant.get(p.home_team_id) ?? "";
          const awayEntrantId = teamToEntrant.get(p.away_team_id) ?? "";
          if (!homeEntrantId || !awayEntrantId) return null;
          const subs: StandingsSubMatchInput[] = fx.subMatches
            .filter((m) => m.pairing_id === p.id)
            .map((m) => {
              const result = fx.results.find((r) => r.match_id === m.id);
              return {
                matchId: m.id,
                sideA: { entrantId: homeEntrantId },
                sideB: { entrantId: awayEntrantId },
                winnerEntrantId: result?.winner_entrant_id ?? null,
                scoreA: result?.score_a,
                scoreB: result?.score_b,
              };
            });
          return {
            pairingId: p.id,
            homeEntrantId,
            awayEntrantId,
            subMatches: subs,
          };
        })
        .filter((p): p is StandingsPairingInput => p !== null);
    }

    return {
      id: fx.fixture.id,
      homeEntrantId: fx.fixture.home_entrant_id,
      awayEntrantId: fx.fixture.away_entrant_id,
      status: fx.fixture.status,
      isBye: fx.fixture.is_bye,
      pairings,
      subMatches,
    };
  });

  const replayRequired = findReplayRequiredItems(
    fixtureInputs,
    comp.league_config
  );

  try {
    const rows = computeStandings({
      config: comp.league_config,
      entrants: entrants.map((e) => ({ id: e.id })),
      fixtures: fixtureInputs,
    });
    return {
      success: true,
      data: { rows, config: comp.league_config, replayRequired },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Standings error",
    };
  }
}

/**
 * Pre-pass for `points.rule === 'win_loss'` with
 * `tied_sub_matches === 'replay_required'`. For 2-team fixtures returns one
 * fixture-level entry per tied fixture; for galas returns one pairing-level
 * entry per tied pairing (no fixture-level row). The pure standings function
 * separately skips the affected fixtures/pairings — this list is purely for
 * surfacing what the manager needs to replay.
 */
export function findReplayRequiredItems(
  fixtures: StandingsFixtureInput[],
  config: LeagueConfig
): ReplayRequiredItem[] {
  if (config.points.rule !== "win_loss") return [];
  if (config.points.tied_sub_matches !== "replay_required") return [];

  const out: ReplayRequiredItem[] = [];
  for (const fx of fixtures) {
    if (fx.status !== "completed") continue;
    if (fx.isBye) continue;
    if (fx.pairings && fx.pairings.length > 0) {
      // Galas: emit one entry per tied pairing — never a fixture-level row.
      for (const p of fx.pairings) {
        let homeWins = 0;
        let awayWins = 0;
        let anyReported = false;
        for (const sm of p.subMatches) {
          if (sm.winnerEntrantId === null) continue;
          anyReported = true;
          if (sm.winnerEntrantId === p.homeEntrantId) homeWins += 1;
          else if (sm.winnerEntrantId === p.awayEntrantId) awayWins += 1;
        }
        if (!anyReported) continue;
        if (homeWins !== awayWins) continue;
        if (!p.pairingId) continue;
        out.push({
          kind: "pairing",
          fixtureId: fx.id,
          pairingId: p.pairingId,
          homeEntrantId: p.homeEntrantId,
          awayEntrantId: p.awayEntrantId,
        });
      }
      continue;
    }
    if (fx.homeEntrantId === null || fx.awayEntrantId === null) continue;
    let homeWins = 0;
    let awayWins = 0;
    for (const sm of fx.subMatches) {
      if (sm.winnerEntrantId === fx.homeEntrantId) homeWins += 1;
      else if (sm.winnerEntrantId === fx.awayEntrantId) awayWins += 1;
    }
    if (homeWins === awayWins) {
      out.push({
        kind: "fixture",
        fixtureId: fx.id,
        homeEntrantId: fx.homeEntrantId,
        awayEntrantId: fx.awayEntrantId,
      });
    }
  }
  return out;
}
