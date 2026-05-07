// =============================================================================
// Push subscription data accessors
// =============================================================================
// Server-only helpers for storing and querying Web Push subscriptions. A
// subscription is a (endpoint, p256dh, auth) triple — one row per browser the
// user has opted in from. Falls back to an in-memory mock when Supabase is
// not configured so mock mode stays functional end-to-end.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export interface PushSubscriptionRow {
  id: string;
  member_id: string | null;
  staff_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
}

export interface SaveSubscriptionParams {
  memberId?: string | null;
  staffId?: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

// ---------- Mock in-memory store ----------

const MOCK_PUSH_SUBSCRIPTIONS: PushSubscriptionRow[] = [];

/**
 * Internal test hook — resets the in-memory mock store. Exported only for
 * vitest; production code never calls this.
 */
export function __resetMockPushSubscriptions(): void {
  MOCK_PUSH_SUBSCRIPTIONS.length = 0;
}

// ---------- saveSubscription ----------

export async function saveSubscription(
  params: SaveSubscriptionParams
): Promise<{ success: boolean; error?: string }> {
  if (!params.memberId && !params.staffId) {
    return {
      success: false,
      error: "Subscription must be linked to a member or staff id",
    };
  }
  if (!params.endpoint || !params.p256dh || !params.auth) {
    return { success: false, error: "Missing subscription fields" };
  }

  if (!isSupabaseConfigured()) {
    const existingIdx = MOCK_PUSH_SUBSCRIPTIONS.findIndex(
      (s) => s.endpoint === params.endpoint
    );
    const nowIso = new Date().toISOString();
    const row: PushSubscriptionRow = {
      id:
        existingIdx >= 0
          ? MOCK_PUSH_SUBSCRIPTIONS[existingIdx].id
          : `mock-push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      member_id: params.memberId ?? null,
      staff_id: params.staffId ?? null,
      endpoint: params.endpoint,
      p256dh: params.p256dh,
      auth: params.auth,
      user_agent: params.userAgent ?? null,
      created_at:
        existingIdx >= 0
          ? MOCK_PUSH_SUBSCRIPTIONS[existingIdx].created_at
          : nowIso,
    };
    if (existingIdx >= 0) {
      MOCK_PUSH_SUBSCRIPTIONS[existingIdx] = row;
    } else {
      MOCK_PUSH_SUBSCRIPTIONS.push(row);
    }
    return { success: true };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        member_id: params.memberId ?? null,
        staff_id: params.staffId ?? null,
        endpoint: params.endpoint,
        p256dh: params.p256dh,
        auth: params.auth,
        user_agent: params.userAgent ?? null,
      },
      { onConflict: "endpoint" }
    );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ---------- removeSubscription ----------

export async function removeSubscription(
  endpoint: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_PUSH_SUBSCRIPTIONS.findIndex(
      (s) => s.endpoint === endpoint
    );
    if (idx >= 0) MOCK_PUSH_SUBSCRIPTIONS.splice(idx, 1);
    return { success: true };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ---------- getSubscriptionsForMember ----------

export async function getSubscriptionsForMember(
  memberId: string
): Promise<PushSubscriptionRow[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_PUSH_SUBSCRIPTIONS.filter((s) => s.member_id === memberId);
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("member_id", memberId);
  return (data as PushSubscriptionRow[] | null) ?? [];
}

// ---------- getSubscriptionsForMembers ----------

export async function getSubscriptionsForMembers(
  memberIds: string[]
): Promise<PushSubscriptionRow[]> {
  if (memberIds.length === 0) return [];

  if (!isSupabaseConfigured()) {
    const set = new Set(memberIds);
    return MOCK_PUSH_SUBSCRIPTIONS.filter(
      (s) => s.member_id !== null && set.has(s.member_id)
    );
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("*")
    .in("member_id", memberIds);
  return (data as PushSubscriptionRow[] | null) ?? [];
}

// ---------- getSubscriptionsForStaff ----------

export async function getSubscriptionsForStaff(
  staffId: string
): Promise<PushSubscriptionRow[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_PUSH_SUBSCRIPTIONS.filter((s) => s.staff_id === staffId);
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("staff_id", staffId);
  return (data as PushSubscriptionRow[] | null) ?? [];
}

export async function getSubscriptionsForStaffMembers(
  staffIds: string[]
): Promise<PushSubscriptionRow[]> {
  if (staffIds.length === 0) return [];

  if (!isSupabaseConfigured()) {
    const set = new Set(staffIds);
    return MOCK_PUSH_SUBSCRIPTIONS.filter(
      (s) => s.staff_id !== null && set.has(s.staff_id)
    );
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("*")
    .in("staff_id", staffIds);
  return (data as PushSubscriptionRow[] | null) ?? [];
}

// ---------- isSubscribed ----------

export async function isSubscribed(
  memberId?: string | null,
  staffId?: string | null
): Promise<boolean> {
  if (!memberId && !staffId) return false;

  if (!isSupabaseConfigured()) {
    return MOCK_PUSH_SUBSCRIPTIONS.some(
      (s) =>
        (memberId != null && s.member_id === memberId) ||
        (staffId != null && s.staff_id === staffId)
    );
  }

  const supabase = createClient();
  let query = supabase.from("push_subscriptions").select("id");
  if (memberId && staffId) {
    query = query.or(`member_id.eq.${memberId},staff_id.eq.${staffId}`);
  } else if (memberId) {
    query = query.eq("member_id", memberId);
  } else if (staffId) {
    query = query.eq("staff_id", staffId);
  }
  const { data } = await query.limit(1);
  return ((data as { id: string }[] | null)?.length ?? 0) > 0;
}
