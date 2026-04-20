// =============================================================================
// Mock data fallback used when Supabase is not configured.
// =============================================================================
// All IDs and rows here mirror the real Supabase schema so the same
// presentation components work in both modes. Dates are computed relative to
// "now" at access time so the dashboard always has sensible upcoming/past
// bookings without needing to edit this file.
// =============================================================================

import type {
  Booking,
  BookingInvite,
  Member,
  MembershipTier,
  Table,
  WalkInGuest,
} from "@/lib/types";

const isoNow = () => new Date().toISOString();
const fixedCreatedAt = "2025-01-01T00:00:00.000Z";

// ---------- Membership tiers ----------

export const MOCK_TIERS: MembershipTier[] = [
  {
    id: "tier-standard",
    name: "Standard",
    monthly_price_cents: 10000,
    credits_per_month: 4,
    priority_booking_days: 3,
    guest_passes_per_month: 1,
    perks: [
      "4 booking credits per month",
      "Book 3 days in advance",
      "1 guest pass per month",
    ],
    sort_order: 1,
    stripe_price_id: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "tier-premium",
    name: "Premium",
    monthly_price_cents: 20000,
    credits_per_month: 10,
    priority_booking_days: 7,
    guest_passes_per_month: 4,
    perks: [
      "10 booking credits per month",
      "Book 7 days in advance",
      "4 guest passes per month",
      "Priority weekend slots",
    ],
    sort_order: 2,
    stripe_price_id: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
];

// ---------- Tables ----------

export const MOCK_TABLES: Table[] = Array.from({ length: 7 }, (_, i) => ({
  id: `table-${i + 1}`,
  table_number: i + 1,
  name: `Table ${i + 1}`,
  status: "available" as const,
  created_at: fixedCreatedAt,
}));

// ---------- Members ----------
// The primary mock member (Mona) mirrors the auth account in mock-users.ts.
// Additional members exist so that invites have realistic inviters/invitees.

export const MOCK_MEMBERS: Member[] = [
  {
    id: "mock-member-row-1",
    auth_user_id: "mock-member-1",
    full_name: "Mona Member",
    email: "member@tigress.test",
    phone: "+65 9123 4567",
    avatar_url: null,
    membership_tier_id: "tier-standard",
    subscription_status: "active",
    stripe_customer_id: null,
    credits_remaining: 3,
    credits_reset_date: futureIsoDate(18),
    join_date: "2025-01-15",
    status: "active",
    notes: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "mock-member-row-2",
    auth_user_id: null,
    full_name: "Alex Johnson",
    email: "alex@tigress.test",
    phone: null,
    avatar_url: null,
    membership_tier_id: "tier-premium",
    subscription_status: "active",
    stripe_customer_id: null,
    credits_remaining: 8,
    credits_reset_date: futureIsoDate(18),
    join_date: "2024-11-02",
    status: "active",
    notes: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "mock-member-row-3",
    auth_user_id: null,
    full_name: "Priya Kumar",
    email: "priya@tigress.test",
    phone: null,
    avatar_url: null,
    membership_tier_id: "tier-standard",
    subscription_status: "active",
    stripe_customer_id: null,
    credits_remaining: 2,
    credits_reset_date: futureIsoDate(18),
    join_date: "2025-02-20",
    status: "active",
    notes: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "mock-member-row-4",
    auth_user_id: null,
    full_name: "Jordan Lee",
    email: "jordan@tigress.test",
    phone: null,
    avatar_url: null,
    membership_tier_id: "tier-premium",
    subscription_status: "active",
    stripe_customer_id: null,
    credits_remaining: 7,
    credits_reset_date: futureIsoDate(18),
    join_date: "2024-09-10",
    status: "active",
    notes: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
];

// ---------- Bookings ----------
// Half upcoming, half past, all for the primary mock member.

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function futureIsoDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

export const MOCK_BOOKINGS: Booking[] = [
  // Upcoming
  {
    id: "booking-1",
    table_id: "table-3",
    member_id: "mock-member-row-1",
    starts_at: hoursFromNow(26),
    ends_at: hoursFromNow(28),
    status: "confirmed",
    credits_used: 1,
    booking_type: "member",
    created_by: "mock-member-row-1",
    notes: "Friday night hit",
    no_show: false,
    reminder_sent_at: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "booking-2",
    table_id: "table-5",
    member_id: "mock-member-row-1",
    starts_at: hoursFromNow(26 * 3 + 19),
    ends_at: hoursFromNow(26 * 3 + 21),
    status: "confirmed",
    credits_used: 1,
    booking_type: "member",
    created_by: "mock-member-row-1",
    notes: null,
    no_show: false,
    reminder_sent_at: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "booking-3",
    table_id: "table-1",
    member_id: "mock-member-row-1",
    starts_at: hoursFromNow(26 * 8),
    ends_at: hoursFromNow(26 * 8 + 3),
    status: "confirmed",
    credits_used: 2,
    booking_type: "member",
    created_by: "mock-member-row-1",
    notes: "Long session",
    no_show: false,
    reminder_sent_at: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "booking-4",
    table_id: "table-2",
    member_id: "mock-member-row-1",
    starts_at: hoursFromNow(26 * 12),
    ends_at: hoursFromNow(26 * 12 + 2),
    status: "confirmed",
    credits_used: 1,
    booking_type: "member",
    created_by: "mock-member-row-1",
    notes: null,
    no_show: false,
    reminder_sent_at: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  // Past
  {
    id: "booking-past-1",
    table_id: "table-4",
    member_id: "mock-member-row-1",
    starts_at: hoursFromNow(-26 * 5),
    ends_at: hoursFromNow(-26 * 5 + 2),
    status: "completed",
    credits_used: 1,
    booking_type: "member",
    created_by: "mock-member-row-1",
    notes: null,
    no_show: false,
    reminder_sent_at: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "booking-past-2",
    table_id: "table-3",
    member_id: "mock-member-row-1",
    starts_at: hoursFromNow(-26 * 10),
    ends_at: hoursFromNow(-26 * 10 + 2),
    status: "completed",
    credits_used: 1,
    booking_type: "member",
    created_by: "mock-member-row-1",
    notes: null,
    no_show: false,
    reminder_sent_at: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "booking-past-3",
    table_id: "table-6",
    member_id: "mock-member-row-1",
    starts_at: hoursFromNow(-26 * 17),
    ends_at: hoursFromNow(-26 * 17 + 1),
    status: "cancelled",
    credits_used: 0,
    booking_type: "member",
    created_by: "mock-member-row-1",
    notes: "Had to cancel last minute",
    no_show: false,
    reminder_sent_at: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "booking-past-4",
    table_id: "table-2",
    member_id: "mock-member-row-1",
    starts_at: hoursFromNow(-26 * 25),
    ends_at: hoursFromNow(-26 * 25 + 2),
    status: "completed",
    credits_used: 1,
    booking_type: "member",
    created_by: "mock-member-row-1",
    notes: null,
    no_show: false,
    reminder_sent_at: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
];

// ---------- Booking invites ----------
// Pending invites TO Mona (from other members), plus invites FROM Mona on
// her own upcoming bookings so the invited-members row has content.

export const MOCK_BOOKING_INVITES: BookingInvite[] = [
  // Invites Mona has extended on her own bookings (accepted/pending).
  {
    id: "invite-out-1",
    booking_id: "booking-1",
    inviter_id: "mock-member-row-1",
    invitee_id: "mock-member-row-2",
    status: "accepted",
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "invite-out-2",
    booking_id: "booking-1",
    inviter_id: "mock-member-row-1",
    invitee_id: "mock-member-row-3",
    status: "pending",
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "invite-out-3",
    booking_id: "booking-3",
    inviter_id: "mock-member-row-1",
    invitee_id: "mock-member-row-4",
    status: "accepted",
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },

  // Inbound invites waiting on Mona's response.
  {
    id: "invite-in-1",
    booking_id: "booking-invited-1",
    inviter_id: "mock-member-row-2",
    invitee_id: "mock-member-row-1",
    status: "pending",
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "invite-in-2",
    booking_id: "booking-invited-2",
    inviter_id: "mock-member-row-4",
    invitee_id: "mock-member-row-1",
    status: "pending",
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },

  // History
  {
    id: "invite-in-3",
    booking_id: "booking-past-1",
    inviter_id: "mock-member-row-3",
    invitee_id: "mock-member-row-1",
    status: "accepted",
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "invite-in-4",
    booking_id: "booking-past-2",
    inviter_id: "mock-member-row-2",
    invitee_id: "mock-member-row-1",
    status: "declined",
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
];

// Bookings referenced by inbound invites so the invites list has something to
// render. These are owned by other members — Mona is the invitee.
export const MOCK_INVITED_BOOKINGS: Booking[] = [
  {
    id: "booking-invited-1",
    table_id: "table-6",
    member_id: "mock-member-row-2",
    starts_at: hoursFromNow(26 * 2),
    ends_at: hoursFromNow(26 * 2 + 2),
    status: "confirmed",
    credits_used: 1,
    booking_type: "member",
    created_by: "mock-member-row-2",
    notes: null,
    no_show: false,
    reminder_sent_at: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "booking-invited-2",
    table_id: "table-4",
    member_id: "mock-member-row-4",
    starts_at: hoursFromNow(26 * 5),
    ends_at: hoursFromNow(26 * 5 + 3),
    status: "confirmed",
    credits_used: 2,
    booking_type: "member",
    created_by: "mock-member-row-4",
    notes: null,
    no_show: false,
    reminder_sent_at: null,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
];

/**
 * In-memory walk-in guest rows. New rows are pushed by `createWalkIn` so the
 * staff calendar can show their guest names.
 */
export const MOCK_WALK_IN_GUESTS: WalkInGuest[] = [];

export function allMockBookings(): Booking[] {
  return [...MOCK_BOOKINGS, ...MOCK_INVITED_BOOKINGS];
}

export function findMockMemberByAuthId(authUserId: string): Member | null {
  return (
    MOCK_MEMBERS.find((m) => m.auth_user_id === authUserId) ?? null
  );
}

export function findMockMemberById(id: string): Member | null {
  return MOCK_MEMBERS.find((m) => m.id === id) ?? null;
}

export function findMockTableById(id: string): Table | null {
  return MOCK_TABLES.find((t) => t.id === id) ?? null;
}

export function findMockTierById(id: string | null): MembershipTier | null {
  if (!id) return null;
  return MOCK_TIERS.find((t) => t.id === id) ?? null;
}

// Touch isoNow so unused-import/unused-var lint doesn't fire if someone later
// removes the only call site.
export const MOCK_DATA_FETCHED_AT = isoNow;
