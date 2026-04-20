"use server";

// =============================================================================
// Competitions — skill-level server actions (Session 21)
// =============================================================================

import { revalidatePath } from "next/cache";
import { setSkillLevel } from "../data/skills";
import { getCurrentActor } from "../data/players";
import { writeCompAuditLog } from "../audit";

export async function setSkillLevelAction(
  memberId: string,
  level: number
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner || actor.player.kind !== "staff") {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await setSkillLevel(memberId, level, actor.player.id);
  if (!result.success) return result;

  await writeCompAuditLog("comp.skill.updated", memberId, actor.player.id, {
    memberId,
    newLevel: level,
  });

  revalidatePath(`/members/${memberId}`);
  revalidatePath("/competitions");
  return { success: true };
}
