"use server";

// =============================================================================
// Competitions — league sub-match results (Session 23)
// =============================================================================
// Separate from actions/results.ts because the authorisation model differs:
//   * Tournament sub-match: WINNING player reports.
//   * League sub-match:     CAPTAIN of either side reports (or manager+).
// After a successful report, the fixture-complete check runs — if every
// sub-match on the fixture has a result, the fixture flips to 'completed'
// and a placeholder event fires (no-op until S26).
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../data/players";
import { getMatch, updateMatchStatus } from "../data/matches";
import { listEntrants } from "../data/entrants";
import { getTeam } from "../data/teams";
import {
  getFixture,
  getFixturesEnriched,
  updateFixtureStatus,
} from "../data/fixtures";
import { listPairingsByFixtureIds } from "../data/fixture-pairings";
import { recordResult } from "../data/match-results";
import { getBlockingApprovalState } from "../data/lineups";
import { findReplayRequiredItems } from "../data/league-standings";
import { getCompetition } from "../data/competitions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  MOCK_COMP_MATCHES,
  MOCK_COMP_MATCH_RESULTS,
} from "../data/mock-data";
import { writeCompAuditLog } from "../audit";
import { emitCompEvent } from "../events";
import type {
  StandingsFixtureInput,
  StandingsPairingInput,
  StandingsSubMatchInput,
} from "../lib/standings";

export interface ReportSubMatchResultInput {
  matchId: string;
  winnerEntrantId: string;
  scoreA: number;
  scoreB: number;
  notes?: string | null;
}

export async function reportSubMatchResultAction(
  input: ReportSubMatchResultInput
): Promise<{ success: boolean; error?: string; fixtureCompleted?: boolean }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };

  const match = await getMatch(input.matchId);
  if (!match) return { success: false, error: "Match not found" };
  if (match.fixture_id === null) {
    return {
      success: false,
      error: "Not a league sub-match (no fixture link)",
    };
  }
  if (match.status !== "scheduled" && match.status !== "in_progress") {
    return { success: false, error: "Match is not open for reporting" };
  }
  if (match.entrant_a_id === null || match.entrant_b_id === null) {
    return { success: false, error: "Match is missing entrants" };
  }
  if (
    input.winnerEntrantId !== match.entrant_a_id &&
    input.winnerEntrantId !== match.entrant_b_id
  ) {
    return { success: false, error: "Winner must be one of the two entrants" };
  }

  // S24b1: refuse to record a result while a non-roster substitute is
  // waiting for opposing-captain approval, or has been rejected and not yet
  // resubmitted. The two states surface as separate error codes so the
  // captain knows whether to wait or to clear + resubmit.
  const blockingState = await getBlockingApprovalState(input.matchId);
  if (blockingState === "pending") {
    return {
      success: false,
      error:
        "LINEUP_PENDING_APPROVAL: A substitute on this match is waiting for opposing-captain approval",
    };
  }
  if (blockingState === "rejected") {
    return {
      success: false,
      error:
        "LINEUP_REJECTED: A substitute on this match was rejected — clear the lineup and submit a different player before reporting",
    };
  }

  // Authorise: manager/owner OR captain of either side.
  if (!actor.isManagerOrOwner) {
    if (actor.player.kind !== "member") {
      return { success: false, error: "Captain or manager role required" };
    }
    const entrants = await listEntrants(match.competition_id);
    const entA = entrants.find((e) => e.id === match.entrant_a_id);
    const entB = entrants.find((e) => e.id === match.entrant_b_id);
    const teamA = entA?.entrant_team_id
      ? await getTeam(entA.entrant_team_id)
      : null;
    const teamB = entB?.entrant_team_id
      ? await getTeam(entB.entrant_team_id)
      : null;
    const isCaptain =
      (teamA && teamA.captain_member_id === actor.player.id) ||
      (teamB && teamB.captain_member_id === actor.player.id);
    if (!isCaptain) {
      return {
        success: false,
        error: "Only a team captain or manager can report this",
      };
    }
  }

  // Score sanity — winner side must hit race-to, loser below it.
  const winnerIsA = input.winnerEntrantId === match.entrant_a_id;
  const winnerRaceTo = winnerIsA ? match.race_to_a : match.race_to_b;
  const winnerScore = winnerIsA ? input.scoreA : input.scoreB;
  const loserScore = winnerIsA ? input.scoreB : input.scoreA;
  if (input.scoreA < 0 || input.scoreB < 0) {
    return { success: false, error: "Scores must be non-negative" };
  }
  if (winnerScore < winnerRaceTo) {
    return {
      success: false,
      error: `Winner must reach race-to (${winnerRaceTo})`,
    };
  }
  if (loserScore >= winnerRaceTo) {
    return {
      success: false,
      error: "Loser score must be below the winner's race-to",
    };
  }

  const rec = await recordResult({
    match_id: input.matchId,
    winner_entrant_id: input.winnerEntrantId,
    score_a: input.scoreA,
    score_b: input.scoreB,
    reported_by_auth_user_id: actor.player.id,
    notes: input.notes ?? null,
  });
  if (!rec.success) return rec;

  await updateMatchStatus(input.matchId, "completed");

  await writeCompAuditLog(
    "comp.match.result_recorded",
    input.matchId,
    actor.player.id,
    {
      matchId: input.matchId,
      fixtureId: match.fixture_id,
      winner: input.winnerEntrantId,
    }
  );

  // Fixture auto-complete — if every sub-match on the fixture has a result,
  // flip the fixture to 'completed' and emit the placeholder event.
  const fixtureCompleted = await maybeAutoCompleteFixture(match.fixture_id);

  // S24b2: when the fixture has just transitioned to completed under a
  // `win_loss + replay_required` config, evaluate the affected fixture (or
  // gala pairing) and emit a `comp.fixture.replay_required` audit row per
  // tied pairing. Result corrections do NOT re-emit because the fixture is
  // already completed when a manager re-records a result.
  if (fixtureCompleted) {
    await emitReplayRequiredIfApplicable({
      fixtureId: match.fixture_id,
      competitionId: match.competition_id,
      actorId: actor.player.id,
    });
  }

  revalidatePath(`/competitions/${match.competition_id}`);
  return { success: true, fixtureCompleted };
}

/**
 * S24b2: detect tied 2-team / gala pairings in `replay_required` mode and
 * emit one audit row per impacted item. Single-fixture-scoped — never
 * emits for fixtures other than the one we just auto-completed. Failures
 * are swallowed by the audit helper, so this never blocks the action.
 */
async function emitReplayRequiredIfApplicable(args: {
  fixtureId: string;
  competitionId: string;
  actorId: string;
}): Promise<void> {
  const comp = await getCompetition(args.competitionId);
  if (!comp || comp.kind !== "league") return;
  const config = comp.league_config;
  if (!config) return;
  if (config.points.rule !== "win_loss") return;
  if (config.points.tied_sub_matches !== "replay_required") return;

  const enriched = await getFixturesEnriched(args.competitionId);
  const fx = enriched.find((f) => f.fixture.id === args.fixtureId);
  if (!fx) return;

  // Build the same StandingsFixtureInput shape the loader uses for the
  // pre-pass — scoped to a single fixture.
  let pairings: StandingsPairingInput[] | undefined;
  if (fx.fixture.pairing_mode !== "two_team") {
    const entrants = await listEntrants(args.competitionId);
    const teamToEntrant = new Map<string, string>();
    for (const e of entrants) {
      if (e.entrant_team_id !== null) teamToEntrant.set(e.entrant_team_id, e.id);
    }
    const pairingsByFixture = await listPairingsByFixtureIds([args.fixtureId]);
    const pairingRows = pairingsByFixture.get(args.fixtureId) ?? [];
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

  const subMatches: StandingsSubMatchInput[] = fx.subMatches
    .filter((m) => m.pairing_id === null)
    .map((m) => {
      const result = fx.results.find((r) => r.match_id === m.id);
      return {
        matchId: m.id,
        sideA: { entrantId: m.entrant_a_id ?? "" },
        sideB: { entrantId: m.entrant_b_id ?? "" },
        winnerEntrantId: result?.winner_entrant_id ?? null,
        scoreA: result?.score_a,
        scoreB: result?.score_b,
      };
    });

  const fixtureInput: StandingsFixtureInput = {
    id: fx.fixture.id,
    homeEntrantId: fx.fixture.home_entrant_id,
    awayEntrantId: fx.fixture.away_entrant_id,
    status: fx.fixture.status,
    isBye: fx.fixture.is_bye,
    pairings,
    subMatches,
  };

  const items = findReplayRequiredItems([fixtureInput], config);
  for (const item of items) {
    if (item.fixtureId !== args.fixtureId) continue;
    const auditEntityId =
      item.kind === "pairing" ? item.pairingId : item.fixtureId;
    await writeCompAuditLog(
      "comp.fixture.replay_required",
      auditEntityId,
      args.actorId,
      {
        kind: item.kind,
        fixtureId: item.fixtureId,
        ...(item.kind === "pairing" ? { pairingId: item.pairingId } : {}),
        homeEntrantId: item.homeEntrantId,
        awayEntrantId: item.awayEntrantId,
        competitionId: args.competitionId,
      }
    );
  }
}

async function maybeAutoCompleteFixture(fixtureId: string): Promise<boolean> {
  const fixture = await getFixture(fixtureId);
  if (!fixture) return false;
  if (fixture.status === "completed" || fixture.status === "cancelled") {
    return false;
  }

  // Gather every sub-match for this fixture + whether each has a result.
  let subMatchIds: string[];
  if (!isSupabaseConfigured()) {
    subMatchIds = MOCK_COMP_MATCHES.filter(
      (m) => m.fixture_id === fixtureId
    ).map((m) => m.id);
  } else {
    const supabase = createClient();
    const { data } = await supabase
      .from("comp_matches")
      .select("id")
      .eq("fixture_id", fixtureId);
    subMatchIds = ((data as { id: string }[] | null) ?? []).map((r) => r.id);
  }
  if (subMatchIds.length === 0) return false;

  let resultIds: Set<string>;
  if (!isSupabaseConfigured()) {
    resultIds = new Set(
      MOCK_COMP_MATCH_RESULTS.filter((r) => subMatchIds.includes(r.match_id)).map(
        (r) => r.match_id
      )
    );
  } else {
    const supabase = createClient();
    const { data } = await supabase
      .from("comp_match_results")
      .select("match_id")
      .in("match_id", subMatchIds);
    resultIds = new Set(
      ((data as { match_id: string }[] | null) ?? []).map((r) => r.match_id)
    );
  }

  const allDone = subMatchIds.every((id) => resultIds.has(id));
  if (!allDone) return false;

  await updateFixtureStatus(fixtureId, "completed");
  await writeCompAuditLog("comp.fixture.completed", fixtureId, null, {
    fixtureId,
  });
  await emitCompEvent({
    kind: "match_completed",
    competitionId: fixture.competition_id,
    payload: { fixtureId },
  });
  return true;
}

// Exported for test coverage of the fixture-complete path.
export async function __checkFixtureComplete(fixtureId: string): Promise<boolean> {
  return maybeAutoCompleteFixture(fixtureId);
}
