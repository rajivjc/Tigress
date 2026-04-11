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
import type {
  Booking,
  Member,
  MembershipTier,
  SubscriptionStatus,
  Table,
} from "@/lib/types";

export interface MemberWithTier {
  member: Member;
  tier: MembershipTier | null;
}

/** Returns the current auth user id, from either Supabase or the mock cookie. */
export async function getCurrentAuthUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    // NOTE: cookies() is sync in Next 14. Will need `await cookies()` if
    // upgrading to Next 15+.
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

export interface MemberSearchResult {
  id: string;
  full_name: string;
  email: string;
  membership_tier_id: string | null;
}

/**
 * Partial-match search used by the invite flow to let a member find people
 * to invite to their booking. Case-insensitive on name or email. Excludes
 * the provided ids (booking owner + already-invited members).
 */
export async function searchMembers(
  query: string,
  excludeIds: string[]
): Promise<MemberSearchResult[]> {
  const term = query.trim().toLowerCase();
  if (term.length === 0) return [];

  if (!isSupabaseConfigured()) {
    return MOCK_MEMBERS.filter((m) => {
      if (m.status !== "active") return false;
      if (excludeIds.includes(m.id)) return false;
      return (
        m.full_name.toLowerCase().includes(term) ||
        m.email.toLowerCase().includes(term)
      );
    })
      .slice(0, 10)
      .map((m) => ({
        id: m.id,
        full_name: m.full_name,
        email: m.email,
        membership_tier_id: m.membership_tier_id,
      }));
  }

  const supabase = createClient();

  // Sanitise the search term before interpolating into PostgREST's `.or()`
  // filter. The filter syntax treats `(`, `)`, and `,` as structural
  // characters, so a user supplying them could break out of the filter.
  // We allow only a conservative alphabet (letters, digits, spaces, `@`,
  // `.`, `-`, `_`) and then escape the PostgreSQL LIKE wildcards (`%`, `_`)
  // and backslash so they are treated literally.
  const allowlisted = term.replace(/[^a-z0-9@.\-_\s]/gi, "");
  const safeTerm = allowlisted.replace(/[%_\\]/g, "\\$&");
  if (safeTerm.length === 0) return [];

  let queryBuilder = supabase
    .from("members")
    .select("id, full_name, email, membership_tier_id")
    .or(`full_name.ilike.%${safeTerm}%,email.ilike.%${safeTerm}%`)
    .eq("status", "active")
    .order("full_name", { ascending: true })
    .limit(10);

  if (excludeIds.length > 0) {
    queryBuilder = queryBuilder.not(
      "id",
      "in",
      `(${excludeIds.join(",")})`
    );
  }

  const { data } = await queryBuilder;
  return (data as MemberSearchResult[] | null) ?? [];
}

/**
 * Owner-only: attach (or clear) a Stripe customer id on a member row so
 * downstream webhook events can resolve back to the right member.
 */
export async function linkStripeCustomer(
  memberId: string,
  stripeCustomerId: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = findMockMemberById(memberId);
    if (!row) return { success: false, error: "Member not found" };
    row.stripe_customer_id = stripeCustomerId;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("members")
    .update({ stripe_customer_id: stripeCustomerId })
    .eq("id", memberId);
  if (error) return { success: false, error: error.message };
  return { success: true };
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

/**
 * Owner-only: assign (or clear) a member's membership tier. When a tier is
 * being newly assigned and the member currently has zero credits, the tier's
 * monthly allotment is also credited so the owner doesn't have to do two
 * steps in the common case.
 */
export async function assignTier(
  memberId: string,
  tierId: string | null,
  autoGrantCredits: boolean = true
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = findMockMemberById(memberId);
    if (!row) return { success: false, error: "Member not found" };

    row.membership_tier_id = tierId;
    if (tierId) {
      const tier = findMockTierById(tierId);
      const wasUntiered = row.subscription_status === "none";
      if (wasUntiered) {
        row.subscription_status = "active";
      }
      if (autoGrantCredits && tier && row.credits_remaining === 0) {
        row.credits_remaining = tier.credits_per_month;
      }
    }
    row.updated_at = new Date().toISOString();
    return { success: true };
  }

  const supabase = createClient();

  // Read the current state so we know whether we should auto-activate and
  // auto-grant credits. The action layer is owner-only, so this is safe.
  const { data: existing } = await supabase
    .from("members")
    .select("credits_remaining, membership_tier_id, subscription_status")
    .eq("id", memberId)
    .maybeSingle();
  if (!existing) return { success: false, error: "Member not found" };

  const patch: Partial<Member> = { membership_tier_id: tierId };

  if (tierId) {
    const { data: tierRow } = await supabase
      .from("membership_tiers")
      .select("credits_per_month")
      .eq("id", tierId)
      .maybeSingle();

    if (
      (existing as { subscription_status: SubscriptionStatus })
        .subscription_status === "none"
    ) {
      patch.subscription_status = "active";
    }
    if (
      autoGrantCredits &&
      tierRow &&
      (existing as { credits_remaining: number }).credits_remaining === 0
    ) {
      patch.credits_remaining = (tierRow as {
        credits_per_month: number;
      }).credits_per_month;
    }
  }

  const { error } = await supabase
    .from("members")
    .update(patch)
    .eq("id", memberId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Owner-only: override a member's current credit balance. */
export async function setCredits(
  memberId: string,
  credits: number
): Promise<{ success: boolean; error?: string }> {
  if (!Number.isFinite(credits) || credits < 0) {
    return { success: false, error: "Credits must be zero or greater" };
  }
  const rounded = Math.floor(credits);

  if (!isSupabaseConfigured()) {
    const row = findMockMemberById(memberId);
    if (!row) return { success: false, error: "Member not found" };
    row.credits_remaining = rounded;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("members")
    .update({ credits_remaining: rounded })
    .eq("id", memberId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Owner-only: manually override a member's subscription status. */
export async function setSubscriptionStatus(
  memberId: string,
  status: SubscriptionStatus
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = findMockMemberById(memberId);
    if (!row) return { success: false, error: "Member not found" };
    row.subscription_status = status;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("members")
    .update({ subscription_status: status })
    .eq("id", memberId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export interface CreateMemberInput {
  full_name: string;
  email: string;
  phone: string | null;
  password: string;
  membership_tier_id: string | null;
  credits_remaining: number;
  subscription_status: SubscriptionStatus;
  notes: string | null;
}

export interface CreateMemberResult {
  success: boolean;
  memberId?: string;
  error?: string;
}

/**
 * Owner-only: create a brand new member. In Supabase mode this provisions
 * an auth user via the admin client so the owner sets the initial password,
 * then inserts the matching `members` row. In mock mode we just push a row
 * onto the in-memory list so the UI can be tested without a Supabase
 * project.
 */
export async function createMember(
  input: CreateMemberInput
): Promise<CreateMemberResult> {
  const now = new Date().toISOString();
  const joinDate = now.slice(0, 10);

  if (!isSupabaseConfigured()) {
    // Mock mode: no auth layer, just push an in-memory row so the list/detail
    // pages can render it.
    const id = `mock-member-row-${MOCK_MEMBERS.length + 1}`;
    const row: Member = {
      id,
      auth_user_id: null,
      full_name: input.full_name,
      email: input.email,
      phone: input.phone,
      avatar_url: null,
      membership_tier_id: input.membership_tier_id,
      subscription_status: input.subscription_status,
      stripe_customer_id: null,
      credits_remaining: input.credits_remaining,
      credits_reset_date: null,
      join_date: joinDate,
      status: "active",
      notes: input.notes,
      created_at: now,
      updated_at: now,
    };
    MOCK_MEMBERS.push(row);
    return { success: true, memberId: id };
  }

  // Real mode requires the service-role key to create an auth user.
  const { isSupabaseAdminConfigured } = await import("@/lib/supabase/env");
  if (!isSupabaseAdminConfigured()) {
    return {
      success: false,
      error:
        "Creating members requires the Supabase service role key. Set SUPABASE_SERVICE_ROLE_KEY in the environment.",
    };
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  // 1. Create the auth user (owner chooses the initial password).
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.full_name },
    });
  if (createError || !created.user) {
    return {
      success: false,
      error: createError?.message ?? "Failed to create user",
    };
  }
  const authUserId = created.user.id;

  // 2. Insert the members row.
  const { data: inserted, error: insertError } = await admin
    .from("members")
    .insert({
      auth_user_id: authUserId,
      full_name: input.full_name,
      email: input.email,
      phone: input.phone,
      membership_tier_id: input.membership_tier_id,
      subscription_status: input.subscription_status,
      credits_remaining: input.credits_remaining,
      status: "active",
      notes: input.notes,
      join_date: joinDate,
    })
    .select("id")
    .maybeSingle();

  if (insertError || !inserted) {
    // Roll back the orphan auth user.
    await admin.auth.admin.deleteUser(authUserId).catch(() => {
      /* best effort */
    });
    return {
      success: false,
      error: insertError?.message ?? "Failed to create member",
    };
  }

  return { success: true, memberId: (inserted as { id: string }).id };
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
