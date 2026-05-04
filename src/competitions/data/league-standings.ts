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
import { writeCompAuditLog } from "../audit";
import type { LeagueConfig } from "../types";

export interface CompetitionStandings {
  rows: StandingsRow[];
  config: LeagueConfig;
  /** Fixture ids whose tied sub-match count means they don't contribute to
   *  standings under `points.tied_sub_matches: 'replay_required'`. Only
   *  populated when the league config uses that rule — empty array
   *  otherwise. */
  replayRequiredFixtureIds: string[];
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
          return { homeEntrantId, awayEntrantId, subMatches: subs };
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

  const replayRequiredFixtureIds = findReplayRequiredFixtures(
    fixtureInputs,
    comp.league_config
  );

  // Best-effort audit trail — one row per replay-required fixture per
  // standings load. Audit log is append-only, so a small amount of
  // duplication is acceptable. If this becomes noisy in production a future
  // session can add an "acknowledged" flag to the fixture and skip the
  // audit when set.
  for (const fixtureId of replayRequiredFixtureIds) {
    await writeCompAuditLog(
      "comp.fixture.replay_required",
      fixtureId,
      null,
      { fixtureId, competitionId }
    );
  }

  try {
    const rows = computeStandings({
      config: comp.league_config,
      entrants: entrants.map((e) => ({ id: e.id })),
      fixtures: fixtureInputs,
    });
    return {
      success: true,
      data: { rows, config: comp.league_config, replayRequiredFixtureIds },
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
 * `tied_sub_matches === 'replay_required'`. Returns every fixture that has
 * an equal number of sub-match wins on each side — under that rule those
 * fixtures contribute nothing and need to be replayed before standings can
 * be considered final. Returns an empty array for any other config.
 */
function findReplayRequiredFixtures(
  fixtures: StandingsFixtureInput[],
  config: LeagueConfig
): string[] {
  if (config.points.rule !== "win_loss") return [];
  if (config.points.tied_sub_matches !== "replay_required") return [];

  const out: string[] = [];
  for (const fx of fixtures) {
    if (fx.status !== "completed") continue;
    if (fx.isBye) continue;
    if (fx.pairings && fx.pairings.length > 0) {
      // For galas, a pairing tie inside the gala still means the overall
      // fixture has *something* needing replay — surface the fixture id so
      // organisers know to look. The pure standings function already skips
      // the affected pairings.
      let hasTie = false;
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
        if (anyReported && homeWins === awayWins) {
          hasTie = true;
          break;
        }
      }
      if (hasTie) out.push(fx.id);
      continue;
    }
    if (fx.homeEntrantId === null || fx.awayEntrantId === null) continue;
    let homeWins = 0;
    let awayWins = 0;
    for (const sm of fx.subMatches) {
      if (sm.winnerEntrantId === fx.homeEntrantId) homeWins += 1;
      else if (sm.winnerEntrantId === fx.awayEntrantId) awayWins += 1;
    }
    if (homeWins === awayWins) out.push(fx.id);
  }
  return out;
}
