-- =============================================================================
-- Tigress — S27b payslips, exports, owner settings UI (Session 27b)
-- =============================================================================
-- Adds the venue branding singleton consumed by payslip rendering (PDF/JSON
-- and the staff-side payslip view). Branding is venue-scoped, not payroll-
-- scoped, so it lives in its own table rather than as columns on
-- schedule_payroll_settings — a future export format (e.g. tax docs) can
-- reuse the same row without leaking back into payroll config.
--
-- Singleton enforcement uses the same generated-boolean + UNIQUE pattern
-- introduced for schedule_payroll_settings in S27a-fix-2 Finding 7.
--
-- All RLS policies follow the get_staff_role() envelope rule documented in
-- CLAUDE.md and verified by tests/security/rls-pattern.test.ts.
-- =============================================================================

CREATE TABLE public.payroll_venue_branding (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_name      text NOT NULL DEFAULT '',
  address         text NOT NULL DEFAULT '',
  contact_email   text NOT NULL DEFAULT '',
  contact_phone   text NOT NULL DEFAULT '',
  logo_url        text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Generated boolean column always = TRUE; the UNIQUE index enforces
  -- at-most-one-row at the schema level. See S27a-fix-2 Finding 7.
  singleton_guard boolean GENERATED ALWAYS AS (true) STORED
);

CREATE UNIQUE INDEX payroll_venue_branding_singleton
  ON public.payroll_venue_branding (singleton_guard);

CREATE TRIGGER payroll_venue_branding_updated_at
  BEFORE UPDATE ON public.payroll_venue_branding
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Seed the singleton with placeholder defaults. The owner overwrites these
-- via /owner/payroll/settings/branding once deployed.
INSERT INTO public.payroll_venue_branding (
  venue_name, address, contact_email, contact_phone, logo_url
) VALUES (
  'Tigress',
  '',
  '',
  '',
  ''
);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.payroll_venue_branding ENABLE ROW LEVEL SECURITY;

-- Read by every authenticated staff (payslip rendering needs it on the
-- staff side of the app). Members have no payslip view, so the envelope
-- intentionally excludes 'member'.
CREATE POLICY "payroll_venue_branding select: staff envelope"
  ON public.payroll_venue_branding FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

-- Owner-only writes — branding is a venue-config concern, not a daily-ops one.
CREATE POLICY "payroll_venue_branding write: owner only"
  ON public.payroll_venue_branding FOR ALL
  TO authenticated
  USING (public.get_staff_role() = 'owner')
  WITH CHECK (public.get_staff_role() = 'owner');
