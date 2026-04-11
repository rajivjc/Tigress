// =============================================================================
// Web Push sender
// =============================================================================
// Server-only helpers for delivering push notifications to members. Uses the
// `web-push` library with VAPID keys for authentication — no third-party push
// service. All calls are fire-and-forget with errors swallowed and logged; a
// push delivery failure must NEVER break the booking/invite flow.
//
// Mock mode: when VAPID keys are not configured, the sender logs the payload
// and returns. This keeps local dev and the vitest suite runnable without
// valid keys.
// =============================================================================

import "server-only";
import webpush from "web-push";
import {
  getSubscriptionsForMember,
  getSubscriptionsForMembers,
  removeSubscription,
  type PushSubscriptionRow,
} from "@/lib/data/push-subscriptions";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// ---------- VAPID configuration (one-time on module load) ----------

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  try {
    webpush.setVapidDetails(
      "mailto:admin@tigress.app",
      publicKey,
      privateKey
    );
    vapidConfigured = true;
    return true;
  } catch (err) {
    // Malformed keys — fall through to no-op / mock mode.
    console.warn("[push] Failed to configure VAPID:", err);
    return false;
  }
}

// Attempt configuration at import time so we know early whether the sender is
// live or operating in mock mode. Safe to call again later — it's idempotent.
ensureVapidConfigured();

// ---------- Internal send ----------

async function sendToSubscriptions(
  subscriptions: PushSubscriptionRow[],
  payload: PushPayload
): Promise<void> {
  if (subscriptions.length === 0) return;

  if (!ensureVapidConfigured()) {
    // Mock / unconfigured mode — log and return so the caller's flow continues
    // untouched. This is explicitly noisy so developers can see push events
    // fire without a real VAPID config.
    console.log(
      `[push/mock] Would send to ${subscriptions.length} subscription(s):`,
      payload
    );
    return;
  }

  const json = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json
        );
      } catch (err: unknown) {
        const statusCode =
          err && typeof err === "object" && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;

        // 404 Not Found / 410 Gone = the subscription is permanently dead.
        // Clean it up so we stop trying to reach it.
        if (statusCode === 404 || statusCode === 410) {
          try {
            await removeSubscription(sub.endpoint);
          } catch (cleanupErr) {
            console.warn(
              "[push] Failed to clean up expired subscription:",
              cleanupErr
            );
          }
          return;
        }

        // Any other error is logged but not thrown — the caller's flow
        // (booking create/cancel, invite send) must not break on push
        // delivery failures.
        console.warn("[push] sendNotification failed:", err);
      }
    })
  );
}

// ---------- Public API ----------

/**
 * Fire-and-forget push notification to every subscription belonging to a
 * single member. Never throws. Callers should not await this for correctness —
 * push delivery is best-effort side-effect.
 */
export async function sendPushToMember(
  memberId: string,
  payload: PushPayload
): Promise<void> {
  try {
    const subs = await getSubscriptionsForMember(memberId);
    await sendToSubscriptions(subs, payload);
  } catch (err) {
    console.warn("[push] sendPushToMember failed:", err);
  }
}

/**
 * Batch version — fetches all subscriptions for a list of members in one
 * query and delivers the same payload to each. Used when notifying every
 * accepted invitee on a booking cancellation.
 */
export async function sendPushToMembers(
  memberIds: string[],
  payload: PushPayload
): Promise<void> {
  if (memberIds.length === 0) return;
  try {
    const subs = await getSubscriptionsForMembers(memberIds);
    await sendToSubscriptions(subs, payload);
  } catch (err) {
    console.warn("[push] sendPushToMembers failed:", err);
  }
}
