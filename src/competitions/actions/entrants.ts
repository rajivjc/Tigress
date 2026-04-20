"use server";

// =============================================================================
// Competitions — entrant server actions (Session 21)
// =============================================================================

import { revalidatePath } from "next/cache";
import {
  addEntrant,
  removeEntrant,
  setSeedNumbers,
} from "../data/entrants";
import { getCurrentActor, type EntrantRef } from "../data/players";
import { writeCompAuditLog } from "../audit";

export async function addEntrantAction(
  competitionId: string,
  ref: EntrantRef
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await addEntrant(competitionId, ref);
  if (!result.success || !result.id) return result;

  await writeCompAuditLog("comp.entrant.added", result.id, actor.player.id, {
    competitionId,
    entrantId: result.id,
    refKind: ref.kind,
    refId: ref.id,
  });

  revalidatePath(`/competitions/${competitionId}`);
  return { success: true, id: result.id };
}

export async function removeEntrantAction(
  entrantId: string,
  competitionId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await removeEntrant(entrantId);
  if (!result.success) return result;

  await writeCompAuditLog("comp.entrant.removed", entrantId, actor.player.id, {
    competitionId,
    entrantId,
  });

  revalidatePath(`/competitions/${competitionId}`);
  return { success: true };
}

export async function updateSeedsAction(
  competitionId: string,
  seedMap: Record<string, number | null>
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await setSeedNumbers(competitionId, seedMap);
  if (!result.success) return result;

  revalidatePath(`/competitions/${competitionId}`);
  return { success: true };
}
