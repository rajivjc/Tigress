"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data/staff";
import {
  assignTier,
  createMember,
  getCurrentAuthUserId,
  getMemberProfile,
  linkStripeCustomer,
  searchMembers,
  setCredits,
  setSubscriptionStatus,
  updateMemberNotes,
  type MemberSearchResult,
} from "@/lib/data/members";
import { getBookingById } from "@/lib/data/bookings";
import type { SubscriptionStatus } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUSES: SubscriptionStatus[] = [
  "active",
  "past_due",
  "cancelled",
  "none",
];

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

/**
 * Owner-only: assign or clear a member's membership tier. Auto-activates the
 * subscription and grants the tier's monthly credit allotment when going
 * from "no tier" to a real tier.
 */
export async function assignTierAction(
  memberId: string,
  tierId: string | null
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (current.role !== "owner") {
    return { success: false, error: "Owner only" };
  }

  const result = await assignTier(memberId, tierId);
  if (result.success) {
    revalidatePath(`/members/${memberId}`);
    revalidatePath("/members");
    revalidatePath("/dashboard");
  }
  return result;
}

/** Owner-only: directly set a member's credit balance. */
export async function setCreditsAction(
  memberId: string,
  credits: number
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (current.role !== "owner") {
    return { success: false, error: "Owner only" };
  }

  if (!Number.isFinite(credits) || credits < 0) {
    return { success: false, error: "Credits must be zero or greater" };
  }

  const result = await setCredits(memberId, credits);
  if (result.success) {
    revalidatePath(`/members/${memberId}`);
    revalidatePath("/members");
  }
  return result;
}

/** Owner-only: manually override a member's subscription status. */
export async function setSubscriptionStatusAction(
  memberId: string,
  status: SubscriptionStatus
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (current.role !== "owner") {
    return { success: false, error: "Owner only" };
  }
  if (!VALID_STATUSES.includes(status)) {
    return { success: false, error: "Invalid subscription status" };
  }

  const result = await setSubscriptionStatus(memberId, status);
  if (result.success) {
    revalidatePath(`/members/${memberId}`);
    revalidatePath("/members");
  }
  return result;
}

export interface CreateMemberActionInput {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
  membership_tier_id?: string | null;
  credits_remaining: number;
  subscription_status: SubscriptionStatus;
  notes?: string;
}

/**
 * Owner-only: create a new member account (auth user + members row). Used by
 * the /members/new page so the owner can onboard existing club members who
 * won't self-register.
 */
export async function createMemberAction(
  input: CreateMemberActionInput
): Promise<{ success: boolean; memberId?: string; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (current.role !== "owner") {
    return { success: false, error: "Owner only" };
  }

  const fullName = (input.full_name ?? "").trim();
  const email = (input.email ?? "").trim();
  const phone =
    input.phone && input.phone.trim().length > 0 ? input.phone.trim() : null;
  const password = input.password ?? "";
  const notes =
    input.notes && input.notes.trim().length > 0 ? input.notes.trim() : null;

  if (fullName.length === 0) {
    return { success: false, error: "Full name is required" };
  }
  if (!EMAIL_RE.test(email)) {
    return { success: false, error: "A valid email is required" };
  }
  if (password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }
  if (!VALID_STATUSES.includes(input.subscription_status)) {
    return { success: false, error: "Invalid subscription status" };
  }
  if (
    !Number.isFinite(input.credits_remaining) ||
    input.credits_remaining < 0
  ) {
    return { success: false, error: "Credits must be zero or greater" };
  }

  const result = await createMember({
    full_name: fullName,
    email,
    phone,
    password,
    membership_tier_id: input.membership_tier_id ?? null,
    credits_remaining: Math.floor(input.credits_remaining),
    subscription_status: input.subscription_status,
    notes,
  });

  if (result.success) {
    revalidatePath("/members");
  }
  return result;
}
