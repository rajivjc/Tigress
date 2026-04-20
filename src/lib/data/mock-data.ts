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
import type {
  ChecklistInstance,
  ChecklistInstanceItem,
  ChecklistTemplate,
  ChecklistTemplateItem,
} from "@/lib/types/checklists";
import type {
  Recipe,
  RecipeIngredient,
  RecipeStep,
} from "@/lib/types/recipes";

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

// =============================================================================
// Checklists (Session 18)
// =============================================================================
// Seeded checklist templates used when Supabase is not configured. Daily
// instances are created lazily on first access so this file only holds the
// template definitions.

const MOCK_MANAGER_STAFF_ID = "mock-staff-row-2";

export const MOCK_CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    id: "checklist-template-opening",
    name: "Opening Procedures",
    description: "Run through every morning before the venue opens.",
    category: "daily",
    is_active: true,
    sort_order: 1,
    created_by: MOCK_MANAGER_STAFF_ID,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "checklist-template-closing",
    name: "Closing Procedures",
    description: "Final lockup checks before leaving for the night.",
    category: "daily",
    is_active: true,
    sort_order: 2,
    created_by: MOCK_MANAGER_STAFF_ID,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "checklist-template-weekly-clean",
    name: "Weekly Deep Clean",
    description: "Thorough clean of tables, cues, and common areas.",
    category: "weekly",
    is_active: true,
    sort_order: 3,
    created_by: MOCK_MANAGER_STAFF_ID,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
];

export const MOCK_CHECKLIST_TEMPLATE_ITEMS: ChecklistTemplateItem[] = [
  // Opening
  {
    id: "tmpl-item-open-1",
    template_id: "checklist-template-opening",
    label: "Turn on all table lights",
    description: "Check each fixture — report flickering bulbs to manager.",
    sort_order: 1,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-open-2",
    template_id: "checklist-template-opening",
    label: "Unlock front door and disarm alarm",
    description: null,
    sort_order: 2,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-open-3",
    template_id: "checklist-template-opening",
    label: "Power on POS and verify Qashier sync",
    description: null,
    sort_order: 3,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-open-4",
    template_id: "checklist-template-opening",
    label: "Brush and level all 7 tables",
    description: "Use felt brush, check cushions for wear.",
    sort_order: 4,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-open-5",
    template_id: "checklist-template-opening",
    label: "Stock cue rack (minimum 20 cues)",
    description: null,
    sort_order: 5,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-open-6",
    template_id: "checklist-template-opening",
    label: "Check bathrooms are clean and stocked",
    description: null,
    sort_order: 6,
    created_at: fixedCreatedAt,
  },

  // Closing
  {
    id: "tmpl-item-close-1",
    template_id: "checklist-template-closing",
    label: "Clear and wipe down all tables",
    description: null,
    sort_order: 1,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-close-2",
    template_id: "checklist-template-closing",
    label: "Rack and count cues",
    description: null,
    sort_order: 2,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-close-3",
    template_id: "checklist-template-closing",
    label: "Empty bins and replace liners",
    description: null,
    sort_order: 3,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-close-4",
    template_id: "checklist-template-closing",
    label: "Cash up POS and reconcile Qashier",
    description: "Flag variance > $5 to manager.",
    sort_order: 4,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-close-5",
    template_id: "checklist-template-closing",
    label: "Turn off table lights and overhead fans",
    description: null,
    sort_order: 5,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-close-6",
    template_id: "checklist-template-closing",
    label: "Arm alarm and lock front door",
    description: null,
    sort_order: 6,
    created_at: fixedCreatedAt,
  },

  // Weekly deep clean
  {
    id: "tmpl-item-weekly-1",
    template_id: "checklist-template-weekly-clean",
    label: "Vacuum all table rails",
    description: null,
    sort_order: 1,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-weekly-2",
    template_id: "checklist-template-weekly-clean",
    label: "Re-tip worn cues (check chalk wear pattern)",
    description: null,
    sort_order: 2,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-weekly-3",
    template_id: "checklist-template-weekly-clean",
    label: "Deep-clean bathrooms",
    description: null,
    sort_order: 3,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-weekly-4",
    template_id: "checklist-template-weekly-clean",
    label: "Wipe down light fixtures",
    description: null,
    sort_order: 4,
    created_at: fixedCreatedAt,
  },
  {
    id: "tmpl-item-weekly-5",
    template_id: "checklist-template-weekly-clean",
    label: "Mop entire floor area",
    description: null,
    sort_order: 5,
    created_at: fixedCreatedAt,
  },
];

/**
 * In-memory checklist instances + items. New rows are pushed by
 * `getChecklistsForDate` when it materialises a template for a given date.
 */
export const MOCK_CHECKLIST_INSTANCES: ChecklistInstance[] = [];
export const MOCK_CHECKLIST_INSTANCE_ITEMS: ChecklistInstanceItem[] = [];

/** Internal test hook — reset lazy instances between tests. */
export function __resetMockChecklistInstances(): void {
  MOCK_CHECKLIST_INSTANCES.length = 0;
  MOCK_CHECKLIST_INSTANCE_ITEMS.length = 0;
}

// =============================================================================
// Recipes (Session 19)
// =============================================================================
// Seeded recipes for mock mode. Ingredients + steps are stored as separate
// arrays so the data layer can mirror the real Supabase response shape.

export const MOCK_RECIPES: Recipe[] = [
  {
    id: "recipe-margarita",
    name: "Margarita",
    category: "cocktails",
    notes:
      "Shake hard — the dilution matters. Salt rim is classic; leave a gap for guests who don't want salt.",
    prep_time_minutes: 3,
    image_url: null,
    is_active: true,
    created_by: MOCK_MANAGER_STAFF_ID,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "recipe-espresso-martini",
    name: "Espresso Martini",
    category: "cocktails",
    notes:
      "Use freshly-pulled espresso — instant won't foam the same. Double-strain for a clean crema.",
    prep_time_minutes: 4,
    image_url: null,
    is_active: true,
    created_by: MOCK_MANAGER_STAFF_ID,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "recipe-virgin-mojito",
    name: "Virgin Mojito",
    category: "mocktails",
    notes: "Gently press the mint — don't shred it or it goes bitter.",
    prep_time_minutes: 3,
    image_url: null,
    is_active: true,
    created_by: MOCK_MANAGER_STAFF_ID,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "recipe-jagerbomb",
    name: "Jägerbomb",
    category: "shots",
    notes: null,
    prep_time_minutes: 1,
    image_url: null,
    is_active: true,
    created_by: MOCK_MANAGER_STAFF_ID,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
  {
    id: "recipe-long-black",
    name: "Long Black",
    category: "coffee",
    notes: "Water first, then espresso — preserves the crema.",
    prep_time_minutes: 2,
    image_url: null,
    is_active: true,
    created_by: MOCK_MANAGER_STAFF_ID,
    created_at: fixedCreatedAt,
    updated_at: fixedCreatedAt,
  },
];

export const MOCK_RECIPE_INGREDIENTS: RecipeIngredient[] = [
  // Margarita
  {
    id: "ing-marg-1",
    recipe_id: "recipe-margarita",
    name: "Tequila (blanco)",
    amount: 60,
    unit: "ml",
    sort_order: 1,
  },
  {
    id: "ing-marg-2",
    recipe_id: "recipe-margarita",
    name: "Triple sec",
    amount: 30,
    unit: "ml",
    sort_order: 2,
  },
  {
    id: "ing-marg-3",
    recipe_id: "recipe-margarita",
    name: "Lime juice",
    amount: 30,
    unit: "ml",
    sort_order: 3,
  },
  {
    id: "ing-marg-4",
    recipe_id: "recipe-margarita",
    name: "Salt (for rim)",
    amount: null,
    unit: null,
    sort_order: 4,
  },

  // Espresso Martini
  {
    id: "ing-em-1",
    recipe_id: "recipe-espresso-martini",
    name: "Vodka",
    amount: 50,
    unit: "ml",
    sort_order: 1,
  },
  {
    id: "ing-em-2",
    recipe_id: "recipe-espresso-martini",
    name: "Coffee liqueur",
    amount: 25,
    unit: "ml",
    sort_order: 2,
  },
  {
    id: "ing-em-3",
    recipe_id: "recipe-espresso-martini",
    name: "Espresso (fresh)",
    amount: 30,
    unit: "ml",
    sort_order: 3,
  },
  {
    id: "ing-em-4",
    recipe_id: "recipe-espresso-martini",
    name: "Simple syrup",
    amount: 10,
    unit: "ml",
    sort_order: 4,
  },
  {
    id: "ing-em-5",
    recipe_id: "recipe-espresso-martini",
    name: "Coffee beans (garnish)",
    amount: 3,
    unit: "whole",
    sort_order: 5,
  },

  // Virgin Mojito
  {
    id: "ing-vm-1",
    recipe_id: "recipe-virgin-mojito",
    name: "Lime",
    amount: 0.5,
    unit: "whole",
    sort_order: 1,
  },
  {
    id: "ing-vm-2",
    recipe_id: "recipe-virgin-mojito",
    name: "Mint leaves",
    amount: 10,
    unit: "whole",
    sort_order: 2,
  },
  {
    id: "ing-vm-3",
    recipe_id: "recipe-virgin-mojito",
    name: "Caster sugar",
    amount: 2,
    unit: "tsp",
    sort_order: 3,
  },
  {
    id: "ing-vm-4",
    recipe_id: "recipe-virgin-mojito",
    name: "Soda water",
    amount: 120,
    unit: "ml",
    sort_order: 4,
  },

  // Jägerbomb
  {
    id: "ing-jb-1",
    recipe_id: "recipe-jagerbomb",
    name: "Jägermeister",
    amount: 30,
    unit: "ml",
    sort_order: 1,
  },
  {
    id: "ing-jb-2",
    recipe_id: "recipe-jagerbomb",
    name: "Energy drink",
    amount: 120,
    unit: "ml",
    sort_order: 2,
  },

  // Long Black
  {
    id: "ing-lb-1",
    recipe_id: "recipe-long-black",
    name: "Espresso (double shot)",
    amount: 60,
    unit: "ml",
    sort_order: 1,
  },
  {
    id: "ing-lb-2",
    recipe_id: "recipe-long-black",
    name: "Hot water",
    amount: 120,
    unit: "ml",
    sort_order: 2,
  },
];

export const MOCK_RECIPE_STEPS: RecipeStep[] = [
  // Margarita
  {
    id: "step-marg-1",
    recipe_id: "recipe-margarita",
    step_number: 1,
    instruction: "Rim a chilled coupe or rocks glass with salt.",
  },
  {
    id: "step-marg-2",
    recipe_id: "recipe-margarita",
    step_number: 2,
    instruction:
      "Add tequila, triple sec, and lime juice to a shaker with ice.",
  },
  {
    id: "step-marg-3",
    recipe_id: "recipe-margarita",
    step_number: 3,
    instruction: "Shake hard for 12 seconds until well-chilled.",
  },
  {
    id: "step-marg-4",
    recipe_id: "recipe-margarita",
    step_number: 4,
    instruction: "Strain into the prepared glass. Garnish with a lime wedge.",
  },

  // Espresso Martini
  {
    id: "step-em-1",
    recipe_id: "recipe-espresso-martini",
    step_number: 1,
    instruction:
      "Pull a fresh espresso and let it cool for 30 seconds so it doesn't melt the ice too fast.",
  },
  {
    id: "step-em-2",
    recipe_id: "recipe-espresso-martini",
    step_number: 2,
    instruction:
      "Combine vodka, coffee liqueur, espresso, and simple syrup in a shaker with ice.",
  },
  {
    id: "step-em-3",
    recipe_id: "recipe-espresso-martini",
    step_number: 3,
    instruction: "Shake vigorously for 15 seconds to build a thick foam.",
  },
  {
    id: "step-em-4",
    recipe_id: "recipe-espresso-martini",
    step_number: 4,
    instruction:
      "Double-strain into a chilled martini glass. Float three coffee beans on top.",
  },

  // Virgin Mojito
  {
    id: "step-vm-1",
    recipe_id: "recipe-virgin-mojito",
    step_number: 1,
    instruction:
      "Add mint leaves, lime (cut into wedges), and sugar to a tall glass.",
  },
  {
    id: "step-vm-2",
    recipe_id: "recipe-virgin-mojito",
    step_number: 2,
    instruction:
      "Gently muddle — press the mint, don't shred. Squeeze the lime as you go.",
  },
  {
    id: "step-vm-3",
    recipe_id: "recipe-virgin-mojito",
    step_number: 3,
    instruction: "Fill with crushed ice, top with soda water, and stir briefly.",
  },
  {
    id: "step-vm-4",
    recipe_id: "recipe-virgin-mojito",
    step_number: 4,
    instruction: "Garnish with a mint sprig and a lime wheel.",
  },

  // Jägerbomb
  {
    id: "step-jb-1",
    recipe_id: "recipe-jagerbomb",
    step_number: 1,
    instruction: "Pour energy drink into a highball glass until half full.",
  },
  {
    id: "step-jb-2",
    recipe_id: "recipe-jagerbomb",
    step_number: 2,
    instruction:
      "Pour the Jägermeister into a shot glass and drop it into the highball to serve.",
  },

  // Long Black
  {
    id: "step-lb-1",
    recipe_id: "recipe-long-black",
    step_number: 1,
    instruction: "Add hot water to a warmed cup.",
  },
  {
    id: "step-lb-2",
    recipe_id: "recipe-long-black",
    step_number: 2,
    instruction:
      "Pull a double espresso directly on top of the water to preserve the crema.",
  },
];
