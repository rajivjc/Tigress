"use server";

// =============================================================================
// Competitions — competition server actions (Session 21)
// =============================================================================
// Owner/manager-only mutations. Auth goes through the Player adapter —
// the module never touches `@/lib/data/staff` directly.
// =============================================================================

import { revalidatePath } from "next/cache";
import {
  createCompetitionDraft,
  deleteCompetition,
  updateCompetitionStatus,
  validateCompetitionShape,
  type CreateCompetitionDraftInput,
} from "../data/competitions";
import { getCurrentActor } from "../data/players";
import { writeCompAuditLog } from "../audit";
import type { CompetitionStatus } from "../types";

export interface CreateCompetitionActionInput
  extends Omit<CreateCompetitionDraftInput, "created_by_staff_id"> {}

export async function createCompetitionDraftAction(
  input: CreateCompetitionActionInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }
  const staffId = actor.player.kind === "staff" ? actor.player.id : null;

  const shapeError = validateCompetitionShape(input);
  if (shapeError) return { success: false, error: shapeError };

  const result = await createCompetitionDraft({
    ...input,
    created_by_staff_id: staffId,
  });
  if (!result.success || !result.id) {
    return { success: false, error: result.error ?? "Failed to create competition" };
  }

  await writeCompAuditLog("comp.competition.created", result.id, staffId, {
    competitionId: result.id,
    kind: input.kind,
    format: input.format,
    entrantType: input.entrant_type,
  });

  revalidatePath("/competitions");
  return { success: true, id: result.id };
}

export async function updateCompetitionStatusAction(
  id: string,
  status: CompetitionStatus
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await updateCompetitionStatus(id, status);
  if (!result.success) return result;

  await writeCompAuditLog(
    "comp.competition.status_changed",
    id,
    actor.player.id,
    { competitionId: id, newStatus: status }
  );

  revalidatePath("/competitions");
  revalidatePath(`/competitions/${id}`);
  return { success: true };
}

export async function deleteCompetitionDraftAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await deleteCompetition(id);
  if (!result.success) return result;

  await writeCompAuditLog("comp.competition.deleted", id, actor.player.id, {
    competitionId: id,
  });

  revalidatePath("/competitions");
  return { success: true };
}
