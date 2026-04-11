"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthUserId, getMemberProfile } from "@/lib/data/members";
import { respondToInvite } from "@/lib/data/invites";
import type { BookingInviteStatus } from "@/lib/types";

export async function respondToInviteAction(
  inviteId: string,
  response: Exclude<BookingInviteStatus, "pending">
): Promise<{ success: boolean; error?: string }> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { success: false, error: "Not signed in" };
  }
  const member = await getMemberProfile(authUserId);
  if (!member) {
    return { success: false, error: "Member not found" };
  }

  const result = await respondToInvite(inviteId, member.id, response);

  if (result.success) {
    revalidatePath("/dashboard");
    revalidatePath("/invites");
  }
  return result;
}
