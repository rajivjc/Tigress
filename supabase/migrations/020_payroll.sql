-- =============================================================================
-- Tigress — Payroll engine (Session 27a)
-- =============================================================================
-- Adds the payroll subsystem to the scheduling module:
--   schedule_payroll_settings           — singleton venue config
--   schedule_payroll_rates              — per-staff hourly rate history
--   schedule_payroll_rate_rules         — role + time-of-day multipliers
--   schedule_payroll_overtime_rules     — singleton OT classification config
--   schedule_payroll_holidays           — PH calendar
--   schedule_payroll_runs               — pay-period run rows
--   schedule_payroll_line_items         — engine + manual lines
--   schedule_payroll_run_reconciliation — snapshot at lock time
--
-- Atomic RPCs:
--   schedule_payroll_lock_run
--   schedule_payroll_unlock_run
--   schedule_payroll_recompute_run
--
-- All RLS policies follow the get_staff_role() envelope rule documented
-- in CLAUDE.md and verified by tests/security/rls-pattern.test.ts.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- schedule_payroll_settings (singleton)
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_payroll_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_frequency            text NOT NULL DEFAULT 'monthly'
    CHECK (pay_frequency IN ('weekly', 'fortnightly', 'monthly')),
  payment_offset_days      integer NOT NULL DEFAULT 7,
  default_export_format    text NOT NULL DEFAULT 'csv'
    CHECK (default_export_format IN ('csv', 'pdf', 'json')),
  statutory_deduction_pct  numeric(5,2) NOT NULL DEFAULT 0,
  currency                 text NOT NULL DEFAULT 'SGD',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER schedule_payroll_settings_updated_at
  BEFORE UPDATE ON public.schedule_payroll_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.schedule_payroll_settings (
  pay_frequency, payment_offset_days, default_export_format,
  statutory_deduction_pct, currency
) VALUES ('monthly', 7, 'csv', 0, 'SGD');

-- ---------------------------------------------------------------------------
-- schedule_payroll_rates (per-staff history)
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_payroll_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  hourly_rate     numeric(10,2) NOT NULL CHECK (hourly_rate >= 0),
  effective_from  date NOT NULL,
  effective_until date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE INDEX schedule_payroll_rates_staff_idx
  ON public.schedule_payroll_rates (staff_id, effective_from DESC);

CREATE TRIGGER schedule_payroll_rates_updated_at
  BEFORE UPDATE ON public.schedule_payroll_rates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_payroll_rate_rules
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_payroll_rate_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('role', 'time_of_day')),
  match_value   text NOT NULL,
  window_start  time,
  window_end    time,
  multiplier    numeric(4,2) NOT NULL CHECK (multiplier > 0),
  priority      integer NOT NULL DEFAULT 100,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER schedule_payroll_rate_rules_updated_at
  BEFORE UPDATE ON public.schedule_payroll_rate_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_payroll_overtime_rules (singleton)
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_payroll_overtime_rules (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_threshold_hours    numeric(5,2) DEFAULT 44,
  weekly_ot_multiplier      numeric(4,2) NOT NULL DEFAULT 1.5,
  daily_threshold_hours     numeric(5,2),
  daily_ot_multiplier       numeric(4,2) NOT NULL DEFAULT 1.5,
  rest_day_multiplier       numeric(4,2) NOT NULL DEFAULT 2.0,
  public_holiday_multiplier numeric(4,2) NOT NULL DEFAULT 2.0,
  rest_day_strategy         text NOT NULL DEFAULT 'sunday'
    CHECK (rest_day_strategy IN ('sunday', 'configured_per_staff', 'none')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER schedule_payroll_overtime_rules_updated_at
  BEFORE UPDATE ON public.schedule_payroll_overtime_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.schedule_payroll_overtime_rules DEFAULT VALUES;

-- ---------------------------------------------------------------------------
-- schedule_payroll_holidays (2026 SG seeded)
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_payroll_holidays (
  date       date PRIMARY KEY,
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.schedule_payroll_holidays (date, name) VALUES
  ('2026-01-01', 'New Year''s Day'),
  ('2026-02-17', 'Chinese New Year'),
  ('2026-02-18', 'Chinese New Year'),
  ('2026-04-03', 'Good Friday'),
  ('2026-05-01', 'Labour Day'),
  ('2026-05-31', 'Vesak Day'),
  ('2026-06-01', 'Vesak Day (observed)'),
  ('2026-08-09', 'National Day'),
  ('2026-08-10', 'National Day (observed)'),
  ('2026-11-08', 'Deepavali'),
  ('2026-11-09', 'Deepavali (observed)'),
  ('2026-12-25', 'Christmas Day');

-- ---------------------------------------------------------------------------
-- schedule_payroll_runs
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_payroll_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  payment_date        date NOT NULL,
  status              text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'review', 'locked')),
  locked_at           timestamptz,
  locked_by           uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  unlock_note         text,
  last_computed_at    timestamptz,
  last_exported_at    timestamptz,
  last_export_format  text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_start, period_end),
  CHECK (period_end >= period_start)
);

CREATE INDEX schedule_payroll_runs_status_period_idx
  ON public.schedule_payroll_runs (status, period_start);

CREATE TRIGGER schedule_payroll_runs_updated_at
  BEFORE UPDATE ON public.schedule_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_payroll_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_payroll_line_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES public.schedule_payroll_runs(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN (
    'hours', 'overtime', 'rest_day', 'public_holiday',
    'allowance', 'tip', 'bonus', 'deduction',
    'statutory', 'other'
  )),
  label           text NOT NULL,
  amount          numeric(12,2) NOT NULL,
  hours           numeric(8,2),
  rate_applied    numeric(10,2),
  multipliers     jsonb,
  source          text NOT NULL CHECK (source IN ('engine', 'manual')),
  clock_record_id uuid REFERENCES public.schedule_clock_records(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX schedule_payroll_line_items_run_staff_idx
  ON public.schedule_payroll_line_items (run_id, staff_id);

CREATE INDEX schedule_payroll_line_items_run_kind_idx
  ON public.schedule_payroll_line_items (run_id, kind);

CREATE TRIGGER schedule_payroll_line_items_updated_at
  BEFORE UPDATE ON public.schedule_payroll_line_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_payroll_run_reconciliation
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_payroll_run_reconciliation (
  run_id                  uuid PRIMARY KEY REFERENCES public.schedule_payroll_runs(id) ON DELETE CASCADE,
  clock_records           jsonb NOT NULL,
  rates_snapshot          jsonb NOT NULL,
  overtime_rules_snapshot jsonb NOT NULL,
  holidays_snapshot       jsonb NOT NULL,
  locked_at               timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Atomic RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.schedule_payroll_lock_run(
  p_run_id uuid,
  p_locker_staff_id uuid,
  p_clock_records jsonb,
  p_rates_snapshot jsonb,
  p_overtime_rules_snapshot jsonb,
  p_holidays_snapshot jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  current_status text;
BEGIN
  SELECT status INTO current_status
    FROM public.schedule_payroll_runs
   WHERE id = p_run_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;
  IF current_status <> 'review' THEN
    RAISE EXCEPTION 'Run is not in review status (got %)', current_status;
  END IF;

  INSERT INTO public.schedule_payroll_run_reconciliation (
    run_id, clock_records, rates_snapshot,
    overtime_rules_snapshot, holidays_snapshot, locked_at
  ) VALUES (
    p_run_id, p_clock_records, p_rates_snapshot,
    p_overtime_rules_snapshot, p_holidays_snapshot, now()
  );

  UPDATE public.schedule_payroll_runs
     SET status = 'locked',
         locked_at = now(),
         locked_by = p_locker_staff_id,
         unlock_note = NULL
   WHERE id = p_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_payroll_lock_run(uuid, uuid, jsonb, jsonb, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.schedule_payroll_unlock_run(
  p_run_id uuid,
  p_unlocker_staff_id uuid,
  p_note text
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  current_status text;
BEGIN
  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'Unlock note is required';
  END IF;

  SELECT status INTO current_status
    FROM public.schedule_payroll_runs
   WHERE id = p_run_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;
  IF current_status <> 'locked' THEN
    RAISE EXCEPTION 'Run is not locked (got %)', current_status;
  END IF;

  DELETE FROM public.schedule_payroll_run_reconciliation
   WHERE run_id = p_run_id;

  UPDATE public.schedule_payroll_runs
     SET status = 'review',
         locked_at = NULL,
         locked_by = p_unlocker_staff_id,
         unlock_note = p_note
   WHERE id = p_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_payroll_unlock_run(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.schedule_payroll_recompute_run(
  p_run_id uuid,
  p_engine_items jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  current_status text;
  inserted_count integer;
BEGIN
  SELECT status INTO current_status
    FROM public.schedule_payroll_runs
   WHERE id = p_run_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;
  IF current_status <> 'draft' THEN
    RAISE EXCEPTION 'Recompute requires draft status (got %)', current_status;
  END IF;

  DELETE FROM public.schedule_payroll_line_items
   WHERE run_id = p_run_id AND source = 'engine';

  IF jsonb_array_length(COALESCE(p_engine_items, '[]'::jsonb)) > 0 THEN
    INSERT INTO public.schedule_payroll_line_items (
      run_id, staff_id, kind, label, amount, hours,
      rate_applied, multipliers, source, clock_record_id, notes
    )
    SELECT
      p_run_id,
      (item->>'staff_id')::uuid,
      item->>'kind',
      item->>'label',
      (item->>'amount')::numeric,
      NULLIF(item->>'hours', '')::numeric,
      NULLIF(item->>'rate_applied', '')::numeric,
      item->'multipliers',
      'engine',
      NULLIF(item->>'clock_record_id', '')::uuid,
      item->>'notes'
    FROM jsonb_array_elements(p_engine_items) item;
  END IF;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  UPDATE public.schedule_payroll_runs
     SET last_computed_at = now()
   WHERE id = p_run_id;

  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_payroll_recompute_run(uuid, jsonb) TO authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.schedule_payroll_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_payroll_rates              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_payroll_rate_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_payroll_overtime_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_payroll_holidays           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_payroll_runs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_payroll_line_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_payroll_run_reconciliation ENABLE ROW LEVEL SECURITY;

-- ---------- schedule_payroll_settings ----------
CREATE POLICY "schedule_payroll_settings select: manager/owner"
  ON public.schedule_payroll_settings FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "schedule_payroll_settings write: owner only"
  ON public.schedule_payroll_settings FOR ALL
  TO authenticated
  USING (public.get_staff_role() = 'owner')
  WITH CHECK (public.get_staff_role() = 'owner');

-- ---------- schedule_payroll_rates ----------
CREATE POLICY "schedule_payroll_rates select: self or manager/owner"
  ON public.schedule_payroll_rates FOR SELECT
  TO authenticated
  USING (
    public.get_staff_role() IN ('staff', 'manager', 'owner')
    AND (
      staff_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
      OR public.get_staff_role() IN ('manager', 'owner')
    )
  );

CREATE POLICY "schedule_payroll_rates write: owner only"
  ON public.schedule_payroll_rates FOR ALL
  TO authenticated
  USING (public.get_staff_role() = 'owner')
  WITH CHECK (public.get_staff_role() = 'owner');

-- ---------- schedule_payroll_rate_rules ----------
CREATE POLICY "schedule_payroll_rate_rules select: manager/owner"
  ON public.schedule_payroll_rate_rules FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "schedule_payroll_rate_rules write: owner only"
  ON public.schedule_payroll_rate_rules FOR ALL
  TO authenticated
  USING (public.get_staff_role() = 'owner')
  WITH CHECK (public.get_staff_role() = 'owner');

-- ---------- schedule_payroll_overtime_rules ----------
CREATE POLICY "schedule_payroll_overtime_rules select: manager/owner"
  ON public.schedule_payroll_overtime_rules FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "schedule_payroll_overtime_rules write: owner only"
  ON public.schedule_payroll_overtime_rules FOR ALL
  TO authenticated
  USING (public.get_staff_role() = 'owner')
  WITH CHECK (public.get_staff_role() = 'owner');

-- ---------- schedule_payroll_holidays ----------
CREATE POLICY "schedule_payroll_holidays select: staff envelope"
  ON public.schedule_payroll_holidays FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "schedule_payroll_holidays write: owner only"
  ON public.schedule_payroll_holidays FOR ALL
  TO authenticated
  USING (public.get_staff_role() = 'owner')
  WITH CHECK (public.get_staff_role() = 'owner');

-- ---------- schedule_payroll_runs ----------
CREATE POLICY "schedule_payroll_runs select: manager/owner"
  ON public.schedule_payroll_runs FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "schedule_payroll_runs insert: manager/owner"
  ON public.schedule_payroll_runs FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

-- Update: manager+owner for status changes; lock/unlock paths use RPC.
-- Owner-only branch protects the locked_at / locked_by / unlock_note triple
-- when set directly outside the RPC.
CREATE POLICY "schedule_payroll_runs update: manager/owner"
  ON public.schedule_payroll_runs FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "schedule_payroll_runs delete: manager/owner draft"
  ON public.schedule_payroll_runs FOR DELETE
  TO authenticated
  USING (
    public.get_staff_role() IN ('manager', 'owner')
    AND status = 'draft'
  );

-- ---------- schedule_payroll_line_items ----------
CREATE POLICY "schedule_payroll_line_items select: manager/owner or self locked"
  ON public.schedule_payroll_line_items FOR SELECT
  TO authenticated
  USING (
    public.get_staff_role() IN ('manager', 'owner')
    OR (
      public.get_staff_role() IN ('staff', 'manager', 'owner')
      AND staff_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.schedule_payroll_runs r
        WHERE r.id = run_id AND r.status = 'locked'
      )
    )
  );

CREATE POLICY "schedule_payroll_line_items write: manager/owner draft only"
  ON public.schedule_payroll_line_items FOR ALL
  TO authenticated
  USING (
    public.get_staff_role() IN ('manager', 'owner')
    AND EXISTS (
      SELECT 1 FROM public.schedule_payroll_runs r
      WHERE r.id = run_id AND r.status = 'draft'
    )
  )
  WITH CHECK (
    public.get_staff_role() IN ('manager', 'owner')
    AND EXISTS (
      SELECT 1 FROM public.schedule_payroll_runs r
      WHERE r.id = run_id AND r.status = 'draft'
    )
  );

-- ---------- schedule_payroll_run_reconciliation ----------
-- Read by manager/owner; writes only via service role / RPC.
CREATE POLICY "schedule_payroll_run_reconciliation select: manager/owner"
  ON public.schedule_payroll_run_reconciliation FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));
