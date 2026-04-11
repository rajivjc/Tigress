// =============================================================================
// Member data accessors
// =============================================================================
// Server-only helpers used by dashboard / profile pages. Each function falls
// back to mock data when Supabase is not configured.
// =============================================================================

import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import {
  MOCK_TIERS,
  findMockMemberByAuthId,
  findMockMemberById,
  findMockTierById,
} from "./mock-data";
import type { Member, MembershipTier } from "@/lib/types";

export interface MemberWithTier {
  member: Member;
  tier: MembershipTier | null;
}

/** Returns the current auth user id, from either Supabase or the mock cookie. */
export async function getCurrentAuthUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return cookies().get(MOCK_SESSION_COOKIE)?.value ?? null;
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Look up a member by their auth user id. */
export async function getMemberProfile(
  authUserId: string
): Promise<Member | null> {
  if (!isSupabaseConfigured()) {
    return findMockMemberByAuthId(authUserId);
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("members")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return (data as Member | null) ?? null;
}

/** Return a member plus their membership tier row in one call. */
export async function getMemberWithTier(
  authUserId: string
): Promise<MemberWithTier | null> {
  if (!isSupabaseConfigured()) {
    const member = findMockMemberByAuthId(authUserId);
    if (!member) return null;
    return {
      member,
      tier: findMockTierById(member.membership_tier_id),
    };
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("members")
    .select("*, membership_tiers(*)")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (!data) return null;
  const { membership_tiers, ...member } = data as Member & {
    membership_tiers: MembershipTier | null;
  };
  return { member: member as Member, tier: membership_tiers };
}

/** Fetch a member by their primary key (used when resolving inviter/invitees). */
export async function getMemberById(id: string): Promise<Member | null> {
  if (!isSupabaseConfigured()) {
    return findMockMemberById(id);
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("members")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Member | null) ?? null;
}

/** All tiers (used on profile page to show available perks). */
export async function getAllTiers(): Promise<MembershipTier[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_TIERS;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("membership_tiers")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data as MembershipTier[] | null) ?? [];
}

/** Persist profile updates. Returns the updated row on success. */
export async function updateMemberProfile(
  memberId: string,
  patch: Pick<Member, "full_name" | "phone" | "avatar_url">
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    // Mock mode: no persistence layer. Mutate the in-memory row so the
    // change survives until the next page load.
    const row = findMockMemberById(memberId);
    if (!row) {
      return { success: false, error: "Member not found" };
    }
    row.full_name = patch.full_name;
    row.phone = patch.phone;
    row.avatar_url = patch.avatar_url;
    return { success: true };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("members")
    .update({
      full_name: patch.full_name,
      phone: patch.phone,
      avatar_url: patch.avatar_url,
    })
    .eq("id", memberId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}
