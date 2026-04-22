"use server";

// =============================================================================
// Competitions — result reporting (Session 22)
// =============================================================================
// Three entry points:
//   * reportMatchResultAction     — members: the WINNING player reports.
//   * overrideMatchResultAction   — manager / owner: upsert any result.
//   * clearMatchResultAction      — manager / owner: wipe a result + cascade.
//
// After a successful report / override, the advance path runs:
//   1. Record the result row.
//   2. Set the match to completed (+ stamp is_walkover when applicable).
//   3. advanceWinner populates the downstream entrant slot.
//   4. If the match was the final, transition the competition to
//      completed and emit a placeholder event (the actual feed auto-post
//      lands in S26).
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentActor } from "../data/players";
import {
  advanceWinner,
  listBracketMatches,
  revertAdvance,
} from "../data/bracket";
import { listEntrants } from "../data/entrants";
import { getMatch, updateMatchStatus } from "../data/matches";
import {
  clearResult,
  getResult,
  recordResult,
} from "../data/match-results";
import {
  getCompetition,
  updateCompetitionStatus,
} from "../data/competitions";
import { writeCompAuditLog } from "../audit";
import { emitCompEvent } from "../events";

export interface ReportResultInput {
  matchId: string;
  winnerEntrantId: string;
  scoreA: number;
  scoreB: number;
  brokenByEntrantId?: string | null;
  flags?: Record<string, unknown>;
  notes?: string | null;
}

export async function reportMatchResultAction(
  input: ReportResultInput
): Promise<{ success: boolean; error?: string; nextMatchId?: string | null }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (actor.player.kind !== "member") {
    return {
      success: false,
      error: "Members only — managers use the override action",
    };
  }

  const match = await getMatch(input.matchId);
  if (!match) return { success: false, error: "Match not found" };
  if (match.status !== "scheduled" && match.status !== "in_progress") {
    return {
      success: false,
      error: "Match is not open for reporting",
    };
  }
  if (match.entrant_a_id === null || match.entrant_b_id === null) {
    return { success: false, error: "Match is waiting on feeder results" };
  }

  if (
    input.winnerEntrantId !== match.entrant_a_id &&
    input.winnerEntrantId !== match.entrant_b_id
  ) {
    return {
      success: false,
      error: "Winner must be one of the two match entrants",
    };
  }

  // Actor must be a participant — and must be reporting themselves as the
  // winner. Losing-player-reports-result is deliberately unsupported in S22.
  const entrants = await listEntrants(match.competition_id);
  const ownEntrant = entrants.find(
    (e) => e.entrant_member_id === actor.player.id
  );
  if (!ownEntrant) {
    return { success: false, error: "You're not registered for this" };
  }
  if (ownEntrant.id !== match.entrant_a_id && ownEntrant.id !== match.entrant_b_id) {
    return { success: false, error: "You're not a participant in this match" };
  }
  if (input.winnerEntrantId !== ownEntrant.id) {
    return {
      success: false,
      error:
        "Only the winning player can report the result (your opponent reports if they won)",
    };
  }

  // Score sanity: winner side must reach race_to, loser side must be below it.
  const winnerIsA = input.winnerEntrantId === match.entrant_a_id;
  const winnerRaceTo = winnerIsA ? match.race_to_a : match.race_to_b;
  const winnerScore = winnerIsA ? input.scoreA : input.scoreB;
  const loserScore = winnerIsA ? input.scoreB : input.scoreA;
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
  if (input.scoreA < 0 || input.scoreB < 0) {
    return { success: false, error: "Scores must be non-negative" };
  }

  return finalizeResult({
    match_id: input.matchId,
    winner_entrant_id: input.winnerEntrantId,
    score_a: input.scoreA,
    score_b: input.scoreB,
    broken_by_entrant_id: input.brokenByEntrantId ?? null,
    flags: input.flags ?? {},
    notes: input.notes ?? null,
    actorId: actor.player.id,
    isOverride: false,
  });
}

export interface OverrideResultInput extends ReportResultInput {
  cascadeRevert?: boolean;
}

export async function overrideMatchResultAction(
  input: OverrideResultInput
): Promise<{ success: boolean; error?: string; nextMatchId?: string | null }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const match = await getMatch(input.matchId);
  if (!match) return { success: false, error: "Match not found" };
  if (match.entrant_a_id === null || match.entrant_b_id === null) {
    return { success: false, error: "Match is waiting on feeder results" };
  }
  if (
    input.winnerEntrantId !== match.entrant_a_id &&
    input.winnerEntrantId !== match.entrant_b_id
  ) {
    return {
      success: false,
      error: "Winner must be one of the two match entrants",
    };
  }
  if (input.scoreA < 0 || input.scoreB < 0) {
    return { success: false, error: "Scores must be non-negative" };
  }

  // If a result already exists AND the downstream match is completed, we
  // need the caller's explicit consent to cascade-revert — otherwise we
  // could leave the bracket pointing at two different winners of the same
  // upstream match.
  const existing = await getResult(input.matchId);
  if (existing && existing.winner_entrant_id !== input.winnerEntrantId) {
    const downstream = await downstreamMatch(match);
    if (downstream) {
      const downstreamResult = await getResult(downstream.id);
      if (downstreamResult && !input.cascadeRevert) {
        return {
          success: false,
          error:
            "Override would invalidate a completed downstream match. Pass cascadeRevert: true to wipe downstream and re-advance.",
        };
      }
      if (downstreamResult && input.cascadeRevert) {
        await revertAdvance(input.matchId);
      }
    }
  }

  return finalizeResult({
    match_id: input.matchId,
    winner_entrant_id: input.winnerEntrantId,
    score_a: input.scoreA,
    score_b: input.scoreB,
    broken_by_entrant_id: input.brokenByEntrantId ?? null,
    flags: input.flags ?? {},
    notes: input.notes ?? null,
    actorId: actor.player.id,
    isOverride: true,
  });
}

export async function clearMatchResultAction(
  matchId: string
): Promise<{ success: boolean; error?: string; clearedMatchIds?: string[] }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const match = await getMatch(matchId);
  if (!match) return { success: false, error: "Match not found" };

  // Cascade downstream advances first, then delete this result.
  const cleared = await revertAdvance(matchId);
  const del = await clearResult(matchId);
  if (!del.success) return del;
  await updateMatchStatus(matchId, "scheduled");

  await writeCompAuditLog(
    "comp.match.result_cleared",
    matchId,
    actor.player.id,
    { matchId, clearedDownstream: cleared.clearedMatchIds }
  );

  revalidatePath(`/competitions/${match.competition_id}`);
  return { success: true, clearedMatchIds: cleared.clearedMatchIds };
}

// ---------------------------------------------------------------------------

interface FinalizeArgs {
  match_id: string;
  winner_entrant_id: string;
  score_a: number;
  score_b: number;
  broken_by_entrant_id: string | null;
  flags: Record<string, unknown>;
  notes: string | null;
  actorId: string;
  isOverride: boolean;
}

async function finalizeResult(
  args: FinalizeArgs
): Promise<{ success: boolean; error?: string; nextMatchId?: string | null }> {
  const rec = await recordResult({
    match_id: args.match_id,
    winner_entrant_id: args.winner_entrant_id,
    score_a: args.score_a,
    score_b: args.score_b,
    broken_by_entrant_id: args.broken_by_entrant_id,
    flags: args.flags,
    reported_by_auth_user_id: args.actorId,
    notes: args.notes,
  });
  if (!rec.success) return rec;

  await updateMatchStatus(args.match_id, "completed");

  // League sub-matches live under a fixture — they don't advance through a
  // bracket. Fixture-level completion is handled by
  // `actions/league-results.ts::reportSubMatchResultAction`; this action
  // just records the result and exits.
  const matchForRoute = await getMatch(args.match_id);
  if (matchForRoute && matchForRoute.fixture_id !== null) {
    await writeCompAuditLog(
      "comp.match.result_recorded",
      args.match_id,
      args.actorId,
      {
        matchId: args.match_id,
        winner: args.winner_entrant_id,
        scoreA: args.score_a,
        scoreB: args.score_b,
        override: args.isOverride,
        leagueSubMatch: true,
      }
    );
    revalidatePath(`/competitions/${matchForRoute.competition_id}`);
    return { success: true, nextMatchId: null };
  }

  const adv = await advanceWinner(args.match_id);
  await writeCompAuditLog(
    "comp.match.advance_triggered",
    args.match_id,
    args.actorId,
    {
      matchId: args.match_id,
      nextMatchId: adv.nextMatchId,
    }
  );

  // If this was the final, transition the competition to completed.
  const match = await getMatch(args.match_id);
  if (match && adv.nextMatchId === null && match.round_number !== null) {
    const matches = await listBracketMatches(match.competition_id);
    const maxRound = matches.reduce(
      (m, r) => (r.round_number && r.round_number > m ? r.round_number : m),
      0
    );
    if (match.round_number === maxRound) {
      await updateCompetitionStatus(match.competition_id, "completed");
      const comp = await getCompetition(match.competition_id);
      if (comp) {
        await writeCompAuditLog(
          "comp.competition.status_changed",
          match.competition_id,
          args.actorId,
          { competitionId: match.competition_id, newStatus: "completed" }
        );
        await emitCompEvent({
          kind: "competition_completed",
          competitionId: match.competition_id,
          payload: { winnerEntrantId: args.winner_entrant_id },
        });
      }
    }
  }

  await writeCompAuditLog(
    "comp.match.result_recorded",
    args.match_id,
    args.actorId,
    {
      matchId: args.match_id,
      winner: args.winner_entrant_id,
      scoreA: args.score_a,
      scoreB: args.score_b,
      override: args.isOverride,
    }
  );

  if (match) {
    revalidatePath(`/competitions/${match.competition_id}`);
  }
  return { success: true, nextMatchId: adv.nextMatchId };
}

async function downstreamMatch(match: {
  competition_id: string;
  round_number: number | null;
  bracket_position: number | null;
}) {
  if (match.round_number === null || match.bracket_position === null) return null;
  const nextRound = match.round_number + 1;
  const nextPos = Math.ceil(match.bracket_position / 2);
  if (!isSupabaseConfigured()) {
    const { MOCK_COMP_MATCHES } = await import("../data/mock-data");
    return (
      MOCK_COMP_MATCHES.find(
        (m) =>
          m.competition_id === match.competition_id &&
          m.round_number === nextRound &&
          m.bracket_position === nextPos
      ) ?? null
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_matches")
    .select("*")
    .eq("competition_id", match.competition_id)
    .eq("round_number", nextRound)
    .eq("bracket_position", nextPos)
    .maybeSingle();
  return data ?? null;
}
