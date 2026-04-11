"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthUserId, getMemberProfile } from "@/lib/data/members";
import { createInvite, respondToInvite } from "@/lib/data/invites";
import { getBookingById } from "@/lib/data/bookings";
import { sendPushToMember } from "@/lib/push/send";
import { formatDateShort, formatTime } from "@/lib/format";
import type { BookingInviteStatus } from "@/lib/types";

export async function createInviteAction(
  bookingId: string,
  inviteeId: string
): Promise<{ success: boolean; error?: string }> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { success: false, error: "Not signed in" };
  }
  const member = await getMemberProfile(authUserId);
  if (!member) {
    return { success: false, error: "Member not found" };
  }

  const result = await createInvite(bookingId, member.id, inviteeId);
  if (result.success) {
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath("/dashboard");
    revalidatePath("/invites");

    // Fire-and-forget notification to the invitee. We reach back into the
    // booking to grab the start time for the body; errors are swallowed
    // inside sendPushToMember so the action response is unaffected.
    const details = await getBookingById(bookingId);
    if (details) {
      const dateLabel = formatDateShort(details.booking.starts_at);
      const timeLabel = formatTime(details.booking.starts_at);
      await sendPushToMember(inviteeId, {
        title: "Session Invite",
        body: `${member.full_name} invited you to a session on ${dateLabel} at ${timeLabel}.`,
        url: "/invites",
        tag: `invite-${result.inviteId ?? bookingId}`,
      });
    }
  }
  return { success: result.success, error: result.error };
}

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
