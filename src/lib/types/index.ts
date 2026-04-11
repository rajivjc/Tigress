// =============================================================================
// Tigress — Shared TypeScript types
// =============================================================================
// These types mirror the Supabase schema defined in
// supabase/migrations/001_initial_schema.sql. Column names use snake_case to
// match what the Supabase client returns directly from Postgres.
// =============================================================================

// ---------- App-level types ----------

export type UserRole = "member" | "staff" | "manager" | "owner";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

// ---------- Enum-style string unions (match DB CHECK constraints) ----------

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "cancelled"
  | "none";

export type MemberStatus = "active" | "suspended" | "inactive";

export type StaffRole = "staff" | "manager" | "owner";

export type EmploymentType = "full_time" | "part_time";

export type StaffStatus = "active" | "inactive";

export type TableStatus =
  | "available"
  | "occupied"
  | "reserved"
  | "blocked";

export type BookingStatus =
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export type BookingType = "member" | "walk_in" | "admin_block";

export type BookingInviteStatus = "pending" | "accepted" | "declined";

export type RateType = "hourly" | "per_person" | "per_game";

// ---------- Database row types ----------

export interface MembershipTier {
  id: string;
  name: string;
  monthly_price_cents: number;
  credits_per_month: number;
  priority_booking_days: number;
  guest_passes_per_month: number;
  perks: unknown[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  membership_tier_id: string | null;
  subscription_status: SubscriptionStatus;
  stripe_customer_id: string | null;
  credits_remaining: number;
  credits_reset_date: string | null;
  join_date: string;
  status: MemberStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Staff {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  employment_type: EmploymentType;
  hourly_rate_cents: number | null;
  status: StaffStatus;
  created_at: string;
  updated_at: string;
}

export interface Table {
  id: string;
  table_number: number;
  name: string;
  status: TableStatus;
  created_at: string;
}

export interface Booking {
  id: string;
  table_id: string;
  member_id: string | null;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  credits_used: number;
  booking_type: BookingType;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WalkInGuest {
  id: string;
  booking_id: string;
  guest_name: string;
  guest_phone: string | null;
  guest_count: number;
  deposit_required: boolean;
  deposit_paid: boolean;
  comments: string | null;
  created_at: string;
}

export interface BookingInvite {
  id: string;
  booking_id: string;
  inviter_id: string;
  invitee_id: string;
  status: BookingInviteStatus;
  created_at: string;
  updated_at: string;
}

export interface BlockedSlot {
  id: string;
  table_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface RateCardEntry {
  id: string;
  rate_type: RateType;
  label: string;
  amount_cents: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
