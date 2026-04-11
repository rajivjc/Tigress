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
  MOCK_BOOKINGS,
  MOCK_MEMBERS,
  MOCK_TIERS,
  findMockMemberByAuthId,
  findMockMemberById,
  findMockTableById,
  findMockTierById,
} from "./mock-data";
import type { Booking, Member, MembershipTier, Table } from "@/lib/types";

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

// =============================================================================
// Staff-side member queries
// =============================================================================

export interface MemberListItem {
  member: Member;
  tier: Pick<MembershipTier, "id" | "name"> | null;
}

/**
 * Returns all members for the staff /members list, optionally filtered by a
 * substring match against name or email (case-insensitive).
 */
export async function getAllMembers(
  search?: string
): Promise<MemberListItem[]> {
  const term = (search ?? "").trim().toLowerCase();

  if (!isSupabaseConfigured()) {
    const filtered = MOCK_MEMBERS.filter((m) => {
      if (!term) return true;
      return (
        m.full_name.toLowerCase().includes(term) ||
        m.email.toLowerCase().includes(term)
      );
    });
    return filtered.map((m) => {
      const tier = findMockTierById(m.membership_tier_id);
      return {
        member: m,
        tier: tier ? { id: tier.id, name: tier.name } : null,
      };
    });
  }

  const supabase = createClient();
  let query = supabase
    .from("members")
    .select("*, membership_tiers(id, name)")
    .order("full_name", { ascending: true });

  if (term) {
    query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
  }

  const { data } = await query;
  return ((data as (Member & {
    membership_tiers: Pick<MembershipTier, "id" | "name"> | null;
  })[] | null) ?? []).map((row) => {
    const { membership_tiers, ...member } = row;
    return { member: member as Member, tier: membership_tiers };
  });
}

export interface MemberBookingHistoryItem {
  booking: Booking;
  table: Pick<Table, "id" | "table_number" | "name"> | null;
}

export interface MemberDetail {
  member: Member;
  tier: MembershipTier | null;
  upcomingBookings: MemberBookingHistoryItem[];
  pastBookings: MemberBookingHistoryItem[];
}

/**
 * Returns a member plus their tier and recent bookings split into upcoming
 * and past lists. Used by the staff /members/[id] detail page.
 */
export async function getMemberDetailById(
  memberId: string
): Promise<MemberDetail | null> {
  const nowIso = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const member = findMockMemberById(memberId);
    if (!member) return null;
    const tier = findMockTierById(member.membership_tier_id);
    const all = MOCK_BOOKINGS.filter((b) => b.member_id === memberId);
    const upcoming = all
      .filter((b) => b.status === "confirmed" && b.starts_at > nowIso)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 5);
    const past = all
      .filter((b) => b.starts_at <= nowIso || b.status !== "confirmed")
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
      .slice(0, 10);
    const enrich = (b: Booking): MemberBookingHistoryItem => {
      const t = findMockTableById(b.table_id);
      return {
        booking: b,
        table: t
          ? { id: t.id, table_number: t.table_number, name: t.name }
          : null,
      };
    };
    return {
      member,
      tier,
      upcomingBookings: upcoming.map(enrich),
      pastBookings: past.map(enrich),
    };
  }

  const supabase = createClient();
  const { data: memberRow } = await supabase
    .from("members")
    .select("*, membership_tiers(*)")
    .eq("id", memberId)
    .maybeSingle();
  if (!memberRow) return null;
  const { membership_tiers, ...member } = memberRow as Member & {
    membership_tiers: MembershipTier | null;
  };

  const [upcomingRes, pastRes] = await Promise.all([
    supabase
      .from("bookings")
      .select("*, tables(id, table_number, name)")
      .eq("member_id", memberId)
      .eq("status", "confirmed")
      .gt("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(5),
    supabase
      .from("bookings")
      .select("*, tables(id, table_number, name)")
      .eq("member_id", memberId)
      .or(`starts_at.lte.${nowIso},status.in.(completed,cancelled,no_show)`)
      .order("starts_at", { ascending: false })
      .limit(10),
  ]);

  const mapRow = (
    row: Booking & { tables: Pick<Table, "id" | "table_number" | "name"> | null }
  ): MemberBookingHistoryItem => {
    const { tables, ...booking } = row;
    return { booking: booking as Booking, table: tables };
  };

  return {
    member: member as Member,
    tier: membership_tiers,
    upcomingBookings: (
      (upcomingRes.data as
        | (Booking & {
            tables: Pick<Table, "id" | "table_number" | "name"> | null;
          })[]
        | null) ?? []
    ).map(mapRow),
    pastBookings: (
      (pastRes.data as
        | (Booking & {
            tables: Pick<Table, "id" | "table_number" | "name"> | null;
          })[]
        | null) ?? []
    ).map(mapRow),
  };
}

/**
 * Updates the staff-only `notes` field on a member. Manager / owner only —
 * the action layer enforces the role check.
 */
export async function updateMemberNotes(
  memberId: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = findMockMemberById(memberId);
    if (!row) return { success: false, error: "Member not found" };
    row.notes = notes || null;
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("members")
    .update({ notes: notes || null })
    .eq("id", memberId);
  if (error) return { success: false, error: error.message };
  return { success: true };
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
