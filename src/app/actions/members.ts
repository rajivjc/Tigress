"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data/staff";
import {
  getCurrentAuthUserId,
  getMemberProfile,
  linkStripeCustomer,
  searchMembers,
  updateMemberNotes,
  type MemberSearchResult,
} from "@/lib/data/members";
import { getBookingById } from "@/lib/data/bookings";

export async function updateMemberNotesAction(
  memberId: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) {
    return { success: false, error: "Not signed in" };
  }
  if (current.role !== "manager" && current.role !== "owner") {
    return { success: false, error: "Only managers or owners can edit notes" };
  }

  const result = await updateMemberNotes(memberId, notes);
  if (result.success) {
    revalidatePath(`/members/${memberId}`);
  }
  return result;
}

/**
 * Partial-match search used by the invite flow. Restricted to authenticated
 * members so random visitors can't enumerate the roster.
 */
export async function searchMembersAction(
  query: string,
  excludeIds: string[] = []
): Promise<{ members: MemberSearchResult[]; error?: string }> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { members: [], error: "Not signed in" };
  }
  const me = await getMemberProfile(authUserId);
  if (!me) {
    return { members: [], error: "Member not found" };
  }

  // Always exclude the caller — they can't invite themselves.
  const exclude = Array.from(new Set([...excludeIds, me.id]));
  const members = await searchMembers(query, exclude);
  return { members };
}

/**
 * Server-side convenience for the invite panel: returns everyone the current
 * member has already invited on this booking so the UI can hide them from
 * search and show their invite status inline.
 */
export async function getInviteExclusionsAction(
  bookingId: string
): Promise<{ excludeIds: string[]; error?: string }> {
  const details = await getBookingById(bookingId);
  if (!details) return { excludeIds: [], error: "Booking not found" };

  const excludeIds: string[] = [];
  if (details.booking.member_id) excludeIds.push(details.booking.member_id);
  for (const inv of details.invites) {
    excludeIds.push(inv.invitee_id);
  }
  return { excludeIds };
}

/**
 * Owner-only: link a Stripe customer id to a member so webhook events can
 * resolve back to the right member row.
 */
export async function linkStripeCustomerAction(
  memberId: string,
  stripeCustomerId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (current.role !== "owner") {
    return { success: false, error: "Owner only" };
  }

  const trimmed = stripeCustomerId.trim();
  if (trimmed.length > 0 && !/^cus_[A-Za-z0-9]+$/.test(trimmed)) {
    return {
      success: false,
      error: "Stripe customer id should look like 'cus_...'",
    };
  }

  const result = await linkStripeCustomer(memberId, trimmed || null);
  if (result.success) {
    revalidatePath(`/members/${memberId}`);
  }
  return result;
}
