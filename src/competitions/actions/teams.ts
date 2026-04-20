"use server";

// =============================================================================
// Competitions — team server actions (Session 21)
// =============================================================================

import { revalidatePath } from "next/cache";
import {
  archiveTeam,
  createTeam,
  getTeam,
  type CreateTeamInput,
} from "../data/teams";
import {
  addToRoster,
  removeFromRoster,
} from "../data/team-members";
import { getCurrentActor } from "../data/players";
import { writeCompAuditLog } from "../audit";

/**
 * Resolves whether the caller can mutate a given team's roster.
 * Manager/owner always passes; otherwise the caller must be the team
 * captain (a member).
 */
async function resolveRosterActor(
  teamId: string
): Promise<{ actorId: string } | null> {
  const actor = await getCurrentActor();
  if (!actor) return null;
  if (actor.isManagerOrOwner) return { actorId: actor.player.id };

  if (actor.player.kind !== "member") return null;
  const team = await getTeam(teamId);
  if (!team) return null;
  if (team.captain_member_id !== actor.player.id) return null;
  return { actorId: actor.player.id };
}

export async function createTeamAction(
  input: CreateTeamInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await createTeam(input);
  if (!result.success || !result.id) return result;

  await writeCompAuditLog("comp.team.created", result.id, actor.player.id, {
    teamId: result.id,
    captain: input.captain_member_id,
  });

  revalidatePath("/competitions");
  return { success: true, id: result.id };
}

export async function archiveTeamAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await archiveTeam(id);
  if (!result.success) return result;

  await writeCompAuditLog("comp.team.archived", id, actor.player.id, {
    teamId: id,
  });

  revalidatePath("/competitions");
  return { success: true };
}

export async function addRosterAction(
  teamId: string,
  memberId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await resolveRosterActor(teamId);
  if (!actor) {
    return {
      success: false,
      error: "Manager/owner or team captain required",
    };
  }

  const result = await addToRoster(teamId, memberId);
  if (!result.success) return result;

  await writeCompAuditLog("comp.team.roster_added", teamId, actor.actorId, {
    teamId,
    memberId,
  });

  revalidatePath("/competitions");
  return { success: true };
}

export async function removeRosterAction(
  teamId: string,
  memberId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await resolveRosterActor(teamId);
  if (!actor) {
    return {
      success: false,
      error: "Manager/owner or team captain required",
    };
  }

  const result = await removeFromRoster(teamId, memberId);
  if (!result.success) return result;

  await writeCompAuditLog("comp.team.roster_removed", teamId, actor.actorId, {
    teamId,
    memberId,
  });

  revalidatePath("/competitions");
  return { success: true };
}
