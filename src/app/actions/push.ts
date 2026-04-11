"use server";

import { getCurrentAuthUserId, getMemberProfile } from "@/lib/data/members";
import { getCurrentStaff } from "@/lib/data/staff";
import {
  isSubscribed,
  removeSubscription,
  saveSubscription,
} from "@/lib/data/push-subscriptions";

export interface SubscribePushInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

/**
 * Saves a browser push subscription for the currently signed-in user. Members
 * link via members.id; staff-only accounts link via staff.id. Staff users who
 * also have a member record get linked on member_id (they're more likely to
 * want member notifications first).
 */
export async function subscribePush(
  input: SubscribePushInput
): Promise<{ success: boolean; error?: string }> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { success: false, error: "Not signed in" };
  }

  // Shape validation — the rest happens in the data layer.
  if (!input?.endpoint || !input?.p256dh || !input?.auth) {
    return { success: false, error: "Invalid subscription" };
  }

  const member = await getMemberProfile(authUserId);
  let staffId: string | null = null;
  if (!member) {
    const current = await getCurrentStaff();
    if (!current) {
      return { success: false, error: "No member or staff record" };
    }
    staffId = current.staff.id;
  }

  return saveSubscription({
    memberId: member?.id ?? null,
    staffId,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    userAgent: input.userAgent ?? null,
  });
}

export async function unsubscribePush(
  endpoint: string
): Promise<{ success: boolean; error?: string }> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { success: false, error: "Not signed in" };
  }
  if (!endpoint) {
    return { success: false, error: "Missing endpoint" };
  }
  // We intentionally don't re-check ownership here — the endpoint is unique
  // and unguessable, and RLS on push_subscriptions prevents cross-user
  // deletion from the authenticated client. In mock mode there's a single
  // local store so there's nothing to isolate.
  return removeSubscription(endpoint);
}

/**
 * Used by the profile page's notification toggle to seed its initial state —
 * returns whether the current user has any active subscriptions. Does NOT
 * check the browser's local subscription, which the client handles on its
 * own via `registration.pushManager.getSubscription()`.
 */
export async function getPushStatus(): Promise<{
  subscribed: boolean;
  error?: string;
}> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { subscribed: false, error: "Not signed in" };
  }
  const member = await getMemberProfile(authUserId);
  let staffId: string | null = null;
  if (!member) {
    const current = await getCurrentStaff();
    if (!current) return { subscribed: false };
    staffId = current.staff.id;
  }
  const subscribed = await isSubscribed(member?.id ?? null, staffId);
  return { subscribed };
}
