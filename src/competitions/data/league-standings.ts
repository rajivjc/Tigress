// =============================================================================
// Competitions — league standings loader (Session 23)
// =============================================================================
// Thin wrapper around `lib/standings.ts::computeStandings`. Loads the
// competition, its entrants, its fixtures + sub-match results, and feeds them
// through the pure standings function.
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

export interface CompetitionStandings {
  rows: StandingsRow[];
  config: LeagueConfig;
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
        };
      });

    let pairings: StandingsPairingInput[] | undefined;
    if (fx.fixture.pairing_mode !== "two_team") {
      const pairingRows = pairingsByFixture.get(fx.fixture.id) ?? [];
      pairings = pairingRows
        .map((p) => {
          const homeEntrantId = teamToEntrant.get(p.home_team_id) ?? "";
          const awayEntrantId = teamToEntrant.get(p.away_team_id) ?? "";
          if (!homeEntrantId || !awayEntrantId) return null;
          const subs = fx.subMatches
            .filter((m) => m.pairing_id === p.id)
            .map((m) => {
              const result = fx.results.find((r) => r.match_id === m.id);
              return {
                matchId: m.id,
                sideA: { entrantId: homeEntrantId },
                sideB: { entrantId: awayEntrantId },
                winnerEntrantId: result?.winner_entrant_id ?? null,
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

  try {
    const rows = computeStandings({
      config: comp.league_config,
      entrants: entrants.map((e) => ({ id: e.id })),
      fixtures: fixtureInputs,
    });
    return { success: true, data: { rows, config: comp.league_config } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Standings error",
    };
  }
}
