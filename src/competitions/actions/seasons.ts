"use server";

// =============================================================================
// Competitions — seasons server actions (Session 23)
// =============================================================================
// Owner-only writes. Every action re-uses the Player adapter for auth.
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../data/players";
import {
  archiveSeason,
  createSeason,
  updateSeasonStatus,
  type CreateSeasonInput,
} from "../data/seasons";
import { writeCompAuditLog } from "../audit";
import type { SeasonStatus } from "../types";

function requireOwner(actor: { player: { kind: string; role?: string } }): string | null {
  if (actor.player.kind !== "staff" || actor.player.role !== "owner") {
    return "Owner role required";
  }
  return null;
}

export async function createSeasonAction(
  input: CreateSeasonInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  const err = requireOwner(actor);
  if (err) return { success: false, error: err };

  const res = await createSeason(input);
  if (!res.success || !res.id) return res;

  await writeCompAuditLog("comp.season.created", res.id, actor.player.id, {
    seasonId: res.id,
    name: input.name,
  });

  revalidatePath("/leagues/seasons");
  revalidatePath("/leagues");
  return { success: true, id: res.id };
}

export async function updateSeasonStatusAction(
  id: string,
  status: SeasonStatus
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  const err = requireOwner(actor);
  if (err) return { success: false, error: err };

  const res = await updateSeasonStatus(id, status);
  if (!res.success) return res;

  await writeCompAuditLog(
    "comp.season.status_changed",
    id,
    actor.player.id,
    { seasonId: id, newStatus: status }
  );

  revalidatePath("/leagues/seasons");
  revalidatePath("/leagues");
  return { success: true };
}

export async function archiveSeasonAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  const err = requireOwner(actor);
  if (err) return { success: false, error: err };

  const res = await archiveSeason(id);
  if (!res.success) return res;

  await writeCompAuditLog("comp.season.archived", id, actor.player.id, {
    seasonId: id,
  });

  revalidatePath("/leagues/seasons");
  return { success: true };
}
