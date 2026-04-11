-- =============================================================================
-- Tigress — Initial schema (Phase 1)
-- =============================================================================
-- Creates all core tables, indexes, RLS policies, triggers and seed data for
-- the Tigress club management platform. Money fields are stored in SGD cents.
-- Timestamps are all timestamptz (UTC).
--
-- Apply via:
--     supabase db push
-- or by running this file directly against a fresh Supabase project.
-- =============================================================================

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Shared helper functions
-- =============================================================================

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Returns the staff role for the current auth user (or NULL if not staff)
CREATE OR REPLACE FUNCTION public.get_staff_role()
RETURNS text AS $$
  SELECT role FROM public.staff WHERE auth_user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns the member id for the current auth user (or NULL if not a member)
CREATE OR REPLACE FUNCTION public.get_member_id()
RETURNS uuid AS $$
  SELECT id FROM public.members WHERE auth_user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================================================
-- Tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- membership_tiers
-- ---------------------------------------------------------------------------
CREATE TABLE public.membership_tiers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  monthly_price_cents    integer NOT NULL,
  credits_per_month      integer NOT NULL,
  priority_booking_days  integer NOT NULL DEFAULT 3,
  guest_passes_per_month integer NOT NULL DEFAULT 0,
  perks                  jsonb DEFAULT '[]'::jsonb,
  sort_order             integer NOT NULL DEFAULT 0,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------------
CREATE TABLE public.members (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id        uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name           text NOT NULL,
  email               text UNIQUE NOT NULL,
  phone               text,
  avatar_url          text,
  membership_tier_id  uuid REFERENCES public.membership_tiers(id),
  subscription_status text NOT NULL DEFAULT 'none'
    CHECK (subscription_status IN ('active', 'past_due', 'cancelled', 'none')),
  stripe_customer_id  text UNIQUE,
  credits_remaining   integer NOT NULL DEFAULT 0,
  credits_reset_date  date,
  join_date           date NOT NULL DEFAULT CURRENT_DATE,
  status              text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'inactive')),
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
CREATE TABLE public.staff (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id      uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name         text NOT NULL,
  email             text UNIQUE NOT NULL,
  phone             text,
  role              text NOT NULL
    CHECK (role IN ('staff', 'manager', 'owner')),
  employment_type   text NOT NULL DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time', 'part_time')),
  hourly_rate_cents integer,
  status            text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- tables (billiards tables)
-- ---------------------------------------------------------------------------
CREATE TABLE public.tables (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number integer UNIQUE NOT NULL,
  name         text NOT NULL,
  status       text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'occupied', 'reserved', 'blocked')),
  created_at   timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
CREATE TABLE public.bookings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id     uuid NOT NULL REFERENCES public.tables(id),
  member_id    uuid REFERENCES public.members(id),
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  credits_used integer NOT NULL DEFAULT 0,
  booking_type text NOT NULL DEFAULT 'member'
    CHECK (booking_type IN ('member', 'walk_in', 'admin_block')),
  created_by   uuid,
  notes        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  CONSTRAINT valid_times CHECK (ends_at > starts_at)
);

-- ---------------------------------------------------------------------------
-- walk_in_guests
-- ---------------------------------------------------------------------------
CREATE TABLE public.walk_in_guests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       uuid UNIQUE NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  guest_name       text NOT NULL,
  guest_phone      text,
  guest_count      integer NOT NULL DEFAULT 1,
  deposit_required boolean NOT NULL DEFAULT false,
  deposit_paid     boolean NOT NULL DEFAULT false,
  comments         text,
  created_at       timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- booking_invites
-- ---------------------------------------------------------------------------
CREATE TABLE public.booking_invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES public.members(id),
  invitee_id uuid NOT NULL REFERENCES public.members(id),
  status     text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (booking_id, invitee_id)
);

-- ---------------------------------------------------------------------------
-- blocked_slots
-- ---------------------------------------------------------------------------
CREATE TABLE public.blocked_slots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id   uuid NOT NULL REFERENCES public.tables(id),
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  reason     text NOT NULL,
  notes      text,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_block_times CHECK (ends_at > starts_at)
);

-- ---------------------------------------------------------------------------
-- rate_card
-- ---------------------------------------------------------------------------
CREATE TABLE public.rate_card (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_type    text NOT NULL
    CHECK (rate_type IN ('hourly', 'per_person', 'per_game')),
  label        text NOT NULL,
  amount_cents integer NOT NULL,
  description  text,
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX bookings_table_time_idx
  ON public.bookings (table_id, starts_at, ends_at);

CREATE INDEX bookings_member_status_idx
  ON public.bookings (member_id, status);

CREATE INDEX booking_invites_invitee_status_idx
  ON public.booking_invites (invitee_id, status);

CREATE INDEX blocked_slots_table_time_idx
  ON public.blocked_slots (table_id, starts_at, ends_at);

CREATE INDEX audit_log_entity_idx
  ON public.audit_log (entity_type, entity_id);

CREATE INDEX audit_log_created_at_idx
  ON public.audit_log (created_at);

CREATE INDEX members_subscription_status_idx
  ON public.members (subscription_status);

-- =============================================================================
-- updated_at triggers
-- =============================================================================

CREATE TRIGGER members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER booking_invites_updated_at
  BEFORE UPDATE ON public.booking_invites
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER membership_tiers_updated_at
  BEFORE UPDATE ON public.membership_tiers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER rate_card_updated_at
  BEFORE UPDATE ON public.rate_card
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER staff_updated_at
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.membership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.walk_in_guests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_invites  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_slots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_card        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log        ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- membership_tiers
-- Readable by any authenticated user; only owner can manage.
-- ---------------------------------------------------------------------------
CREATE POLICY "membership_tiers select: authenticated"
  ON public.membership_tiers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "membership_tiers insert: owner"
  ON public.membership_tiers FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "membership_tiers update: owner"
  ON public.membership_tiers FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() = 'owner')
  WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "membership_tiers delete: owner"
  ON public.membership_tiers FOR DELETE
  TO authenticated
  USING (public.get_staff_role() = 'owner');

-- ---------------------------------------------------------------------------
-- members
-- Members can read/update their own row; staff+ can read all;
-- manager/owner can update any; only manager/owner can insert/delete.
-- ---------------------------------------------------------------------------
CREATE POLICY "members select: self or staff"
  ON public.members FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR public.get_staff_role() IN ('staff', 'manager', 'owner')
  );

CREATE POLICY "members update: self or manager/owner"
  ON public.members FOR UPDATE
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR public.get_staff_role() IN ('manager', 'owner')
  )
  WITH CHECK (
    auth_user_id = auth.uid()
    OR public.get_staff_role() IN ('manager', 'owner')
  );

CREATE POLICY "members insert: manager/owner"
  ON public.members FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "members delete: manager/owner"
  ON public.members FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------------------------------------------------------------------------
-- staff
-- Staff can read their own row; manager/owner can read all; only owner manages.
-- ---------------------------------------------------------------------------
CREATE POLICY "staff select: self or manager/owner"
  ON public.staff FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR public.get_staff_role() IN ('manager', 'owner')
  );

CREATE POLICY "staff insert: owner"
  ON public.staff FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "staff update: owner"
  ON public.staff FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() = 'owner')
  WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "staff delete: owner"
  ON public.staff FOR DELETE
  TO authenticated
  USING (public.get_staff_role() = 'owner');

-- ---------------------------------------------------------------------------
-- tables
-- Readable by any authenticated user; only owner manages table records.
-- ---------------------------------------------------------------------------
CREATE POLICY "tables select: authenticated"
  ON public.tables FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "tables insert: owner"
  ON public.tables FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "tables update: owner"
  ON public.tables FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() = 'owner')
  WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "tables delete: owner"
  ON public.tables FOR DELETE
  TO authenticated
  USING (public.get_staff_role() = 'owner');

-- ---------------------------------------------------------------------------
-- bookings
-- Members see their own + bookings they are invited to; staff+ see all.
-- Members can create their own bookings; staff+ can create any.
-- Members can cancel own bookings; staff+ can update any; only manager/owner delete.
-- ---------------------------------------------------------------------------
CREATE POLICY "bookings select: own, invited, or staff"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (
    member_id = public.get_member_id()
    OR public.get_staff_role() IN ('staff', 'manager', 'owner')
    OR EXISTS (
      SELECT 1 FROM public.booking_invites bi
      WHERE bi.booking_id = bookings.id
        AND bi.invitee_id = public.get_member_id()
    )
  );

CREATE POLICY "bookings insert: member self or staff"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (
    (member_id IS NOT NULL AND member_id = public.get_member_id())
    OR public.get_staff_role() IN ('staff', 'manager', 'owner')
  );

CREATE POLICY "bookings update: own or staff"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (
    member_id = public.get_member_id()
    OR public.get_staff_role() IN ('staff', 'manager', 'owner')
  )
  WITH CHECK (
    member_id = public.get_member_id()
    OR public.get_staff_role() IN ('staff', 'manager', 'owner')
  );

CREATE POLICY "bookings delete: manager/owner"
  ON public.bookings FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------------------------------------------------------------------------
-- walk_in_guests
-- Staff-only — walk-in details are not exposed to members.
-- ---------------------------------------------------------------------------
CREATE POLICY "walk_in_guests select: staff"
  ON public.walk_in_guests FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "walk_in_guests insert: staff"
  ON public.walk_in_guests FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "walk_in_guests update: staff"
  ON public.walk_in_guests FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "walk_in_guests delete: staff"
  ON public.walk_in_guests FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

-- ---------------------------------------------------------------------------
-- booking_invites
-- Inviter and invitee can see their own invites; staff+ see all.
-- Only the booking owner (a member) can create invites for their booking.
-- The invitee can update (accept/decline); staff+ can update any.
-- ---------------------------------------------------------------------------
CREATE POLICY "booking_invites select: participants or staff"
  ON public.booking_invites FOR SELECT
  TO authenticated
  USING (
    inviter_id = public.get_member_id()
    OR invitee_id = public.get_member_id()
    OR public.get_staff_role() IN ('staff', 'manager', 'owner')
  );

CREATE POLICY "booking_invites insert: booking owner"
  ON public.booking_invites FOR INSERT
  TO authenticated
  WITH CHECK (
    inviter_id = public.get_member_id()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND b.member_id = public.get_member_id()
    )
  );

CREATE POLICY "booking_invites update: invitee or staff"
  ON public.booking_invites FOR UPDATE
  TO authenticated
  USING (
    invitee_id = public.get_member_id()
    OR public.get_staff_role() IN ('staff', 'manager', 'owner')
  )
  WITH CHECK (
    invitee_id = public.get_member_id()
    OR public.get_staff_role() IN ('staff', 'manager', 'owner')
  );

CREATE POLICY "booking_invites delete: inviter or staff"
  ON public.booking_invites FOR DELETE
  TO authenticated
  USING (
    inviter_id = public.get_member_id()
    OR public.get_staff_role() IN ('staff', 'manager', 'owner')
  );

-- ---------------------------------------------------------------------------
-- blocked_slots
-- Readable by any authenticated user (so members can see unavailable slots).
-- Only manager/owner can create or modify blocks.
-- ---------------------------------------------------------------------------
CREATE POLICY "blocked_slots select: authenticated"
  ON public.blocked_slots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "blocked_slots insert: manager/owner"
  ON public.blocked_slots FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "blocked_slots update: manager/owner"
  ON public.blocked_slots FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "blocked_slots delete: manager/owner"
  ON public.blocked_slots FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------------------------------------------------------------------------
-- rate_card
-- Readable by any authenticated user (members see rates). Only owner manages.
-- ---------------------------------------------------------------------------
CREATE POLICY "rate_card select: authenticated"
  ON public.rate_card FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "rate_card insert: owner"
  ON public.rate_card FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "rate_card update: owner"
  ON public.rate_card FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() = 'owner')
  WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "rate_card delete: owner"
  ON public.rate_card FOR DELETE
  TO authenticated
  USING (public.get_staff_role() = 'owner');

-- ---------------------------------------------------------------------------
-- audit_log
-- Only manager/owner can read. INSERT is open to any authenticated user
-- (in practice, writes happen via the service role from server code).
-- ---------------------------------------------------------------------------
CREATE POLICY "audit_log select: manager/owner"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "audit_log insert: authenticated"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =============================================================================
-- Seed data
-- =============================================================================

-- 7 billiards tables
INSERT INTO public.tables (table_number, name) VALUES
  (1, 'Table 1'),
  (2, 'Table 2'),
  (3, 'Table 3'),
  (4, 'Table 4'),
  (5, 'Table 5'),
  (6, 'Table 6'),
  (7, 'Table 7');

-- 2 membership tiers (placeholder values)
INSERT INTO public.membership_tiers
  (name, monthly_price_cents, credits_per_month, priority_booking_days, sort_order)
VALUES
  ('Standard', 10000, 4, 3, 1),
  ('Premium',  20000, 10, 7, 2);

-- Sample rate card
INSERT INTO public.rate_card
  (rate_type, label, amount_cents, description, sort_order)
VALUES
  ('hourly',     'Standard Table Rate', 2000, 'Per table per hour', 1),
  ('per_person', 'Per Person Rate',      800, 'Per person per hour', 2),
  ('per_game',   'Per Game Rate',        500, 'Per game',            3);
