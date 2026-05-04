"use server";

// =============================================================================
// Competitions — divisions server actions (Session 23)
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../data/players";
import {
  createDivision,
  deleteDivision,
  type CreateDivisionInput,
} from "../data/divisions";
import { writeCompAuditLog } from "../audit";

function requireOwner(actor: { player: { kind: string; role?: string } }): string | null {
  if (actor.player.kind !== "staff" || actor.player.role !== "owner") {
    return "Owner role required";
  }
  return null;
}

export async function createDivisionAction(
  input: CreateDivisionInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  const err = requireOwner(actor);
  if (err) return { success: false, error: err };

  const res = await createDivision(input);
  if (!res.success || !res.id) return res;

  await writeCompAuditLog("comp.division.created", res.id, actor.player.id, {
    divisionId: res.id,
    seasonId: input.season_id,
    leagueName: input.league_name,
    tier: input.tier,
  });

  revalidatePath("/leagues/divisions");
  return { success: true, id: res.id };
}

export async function deleteDivisionAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  const err = requireOwner(actor);
  if (err) return { success: false, error: err };

  const res = await deleteDivision(id);
  if (!res.success) return res;

  await writeCompAuditLog("comp.division.deleted", id, actor.player.id, {
    divisionId: id,
  });

  revalidatePath("/leagues/divisions");
  return { success: true };
}
