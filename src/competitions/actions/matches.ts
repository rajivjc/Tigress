"use server";

// =============================================================================
// Competitions — match server actions (Session 21)
// =============================================================================

import { revalidatePath } from "next/cache";
import {
  createMatch,
  linkBooking,
  updateMatchStatus,
  type CreateMatchInput,
} from "../data/matches";
import {
  clearResult,
  recordResult,
  verifyResult,
  type RecordResultInput,
} from "../data/match-results";
import { getCurrentActor } from "../data/players";
import { writeCompAuditLog } from "../audit";
import type { MatchStatus } from "../types";

export async function createMatchAction(
  input: CreateMatchInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await createMatch(input);
  if (!result.success || !result.id) return result;

  await writeCompAuditLog("comp.match.created", result.id, actor.player.id, {
    competitionId: input.competition_id,
    matchId: result.id,
    gameTypeId: input.game_type_id,
  });

  revalidatePath(`/competitions/${input.competition_id}`);
  return { success: true, id: result.id };
}

export async function updateMatchStatusAction(
  id: string,
  status: MatchStatus,
  competitionId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await updateMatchStatus(id, status);
  if (!result.success) return result;

  await writeCompAuditLog("comp.match.status_changed", id, actor.player.id, {
    matchId: id,
    newStatus: status,
  });

  revalidatePath(`/competitions/${competitionId}`);
  return { success: true };
}

export async function linkMatchBookingAction(
  id: string,
  bookingId: string | null,
  competitionId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await linkBooking(id, bookingId);
  if (!result.success) return result;
  revalidatePath(`/competitions/${competitionId}`);
  return { success: true };
}

export async function recordResultAction(
  input: RecordResultInput,
  competitionId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await recordResult(input);
  if (!result.success) return result;

  // Moving the match to completed is the expected path when recording a
  // result — do both in one action so staff can't leave a match stuck.
  await updateMatchStatus(input.match_id, "completed");

  await writeCompAuditLog(
    "comp.match.result_recorded",
    input.match_id,
    actor.player.id,
    {
      matchId: input.match_id,
      winner: input.winner_entrant_id,
      scoreA: input.score_a,
      scoreB: input.score_b,
    }
  );

  revalidatePath(`/competitions/${competitionId}`);
  return { success: true };
}

export async function verifyResultAction(
  matchId: string,
  competitionId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner || actor.player.kind !== "staff") {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await verifyResult(matchId, actor.player.id);
  if (!result.success) return result;

  await writeCompAuditLog(
    "comp.match.result_verified",
    matchId,
    actor.player.id,
    { matchId }
  );

  revalidatePath(`/competitions/${competitionId}`);
  return { success: true };
}

export async function clearResultAction(
  matchId: string,
  competitionId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await clearResult(matchId);
  if (!result.success) return result;

  await writeCompAuditLog(
    "comp.match.result_cleared",
    matchId,
    actor.player.id,
    { matchId }
  );

  revalidatePath(`/competitions/${competitionId}`);
  return { success: true };
}
