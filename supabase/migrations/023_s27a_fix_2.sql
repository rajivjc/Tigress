-- =============================================================================
-- Tigress — S27a-fix-2 close-out migration (Session 27a-fix-2)
-- =============================================================================
-- Closes audit findings 7 + 8 from S27a / S27a-fix:
--   * Finding 8 (S27b blocker) — widen schedule_payroll_settings SELECT to
--     the staff envelope so the upcoming /staff/payroll view can read
--     `currency` (and the other non-sensitive venue config). The settings
--     row contains pay_frequency, payment_offset_days, default_export_format,
--     statutory_deduction_pct, currency, timezone — none of which are
--     sensitive; staff already infer them from their payslips.
--   * Finding 7 — schema-level singleton enforcement. The previous shape
--     trusted application code to upsert; a stray INSERT would silently
--     create a second row and break getSettings()'s "first row wins"
--     contract. A generated boolean column + UNIQUE index makes the
--     invariant unforgeable at the DB.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Finding 8 — widen settings SELECT to staff envelope
-- ---------------------------------------------------------------------------
DROP POLICY "schedule_payroll_settings select: manager/owner"
  ON public.schedule_payroll_settings;

CREATE POLICY "schedule_payroll_settings select: staff envelope"
  ON public.schedule_payroll_settings FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

-- ---------------------------------------------------------------------------
-- Finding 7 — singleton enforcement at the schema level
-- ---------------------------------------------------------------------------
-- Generated boolean column always = TRUE; a UNIQUE index on it forces at
-- most one row regardless of the application path that wrote it.
ALTER TABLE public.schedule_payroll_settings
  ADD COLUMN singleton_guard boolean GENERATED ALWAYS AS (true) STORED;

CREATE UNIQUE INDEX schedule_payroll_settings_singleton
  ON public.schedule_payroll_settings (singleton_guard);
