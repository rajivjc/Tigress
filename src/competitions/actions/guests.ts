"use server";

// =============================================================================
// Competitions — guest server actions (Session 21)
// =============================================================================

import { revalidatePath } from "next/cache";
import {
  archiveGuest,
  createGuest,
  type CreateGuestInput,
} from "../data/guests";
import { getCurrentActor } from "../data/players";
import { writeCompAuditLog } from "../audit";

export async function createGuestAction(
  input: Omit<CreateGuestInput, "registered_by_staff_id"> & {
    registered_by_staff_id?: string | null;
  }
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (actor.player.kind !== "staff") {
    return { success: false, error: "Staff role required" };
  }

  const payload: CreateGuestInput = {
    ...input,
    registered_by_staff_id: actor.player.id,
    registered_by_member_id: null,
  };
  const result = await createGuest(payload);
  if (!result.success || !result.id) return result;

  await writeCompAuditLog("comp.guest.created", result.id, actor.player.id, {
    guestId: result.id,
    isPaying: input.is_paying,
  });

  revalidatePath("/competitions");
  return { success: true, id: result.id };
}

export async function archiveGuestAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (actor.player.kind !== "staff") {
    return { success: false, error: "Staff role required" };
  }

  const result = await archiveGuest(id);
  if (!result.success) return result;

  await writeCompAuditLog("comp.guest.archived", id, actor.player.id, {
    guestId: id,
  });

  revalidatePath("/competitions");
  return { success: true };
}
