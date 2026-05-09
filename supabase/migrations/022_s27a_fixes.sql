-- =============================================================================
-- Tigress — S27a audit fixes (Session 27a-fix)
-- =============================================================================
-- Closes the four medium-and-above audit findings from S27a:
--   1. Configurable venue timezone for the payroll OT engine
--   2. Explicit unlocked_by / unlocked_at columns (locked_by stays immutable
--      across the lock lifecycle until the next lock)
--   3. Owner-only enforcement on lock/unlock RPCs (SECURITY DEFINER + role
--      check)
--   4. Status-aware UPDATE RLS split on schedule_payroll_runs so manager
--      cannot transition INTO or OUT OF the locked state — only owner can
--
-- Defense in depth: the RPC's role check is the primary gate; the RLS
-- policy split is the secondary gate. Both required for full coverage.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fix 3 — venue timezone column (defaults to Asia/Singapore)
-- ---------------------------------------------------------------------------
ALTER TABLE public.schedule_payroll_settings
  ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Singapore';

-- ---------------------------------------------------------------------------
-- Fix 4 — explicit unlock-history columns
-- ---------------------------------------------------------------------------
-- locked_by / locked_at carry the CURRENT lock; unlocked_by / unlocked_at
-- carry the MOST RECENT unlock event. Re-locking a previously-unlocked run
-- overwrites locked_by/locked_at; unlocked_by/unlocked_at remain visible
-- so the UI can show the full lock → unlock → re-lock history.
-- ---------------------------------------------------------------------------
ALTER TABLE public.schedule_payroll_runs
  ADD COLUMN unlocked_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN unlocked_at timestamptz;

-- =============================================================================
-- Fix 2A — RPC-level owner-only enforcement (SECURITY DEFINER)
-- =============================================================================
-- Re-defines the lock/unlock RPCs with SECURITY DEFINER + an explicit
-- role check. The function runs as its owner so RLS isn't relevant inside
-- the body, but the explicit role check makes the policy enforced at the
-- function boundary. SET search_path = public is mandatory on every
-- SECURITY DEFINER function (search-path injection prevention).
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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  current_status text;
BEGIN
  -- Owner-only gate. Defense in depth alongside the RLS UPDATE policy
  -- split below; either alone leaves a hole.
  SELECT role INTO caller_role
    FROM public.staff
   WHERE auth_user_id = auth.uid();

  IF caller_role IS NULL OR caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Owner role required to lock a payroll run';
  END IF;

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

  -- Re-lock overwrites locked_by/locked_at (they describe the CURRENT
  -- lock); unlocked_by / unlocked_at left intact so the UI can show the
  -- prior unlock event.
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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  current_status text;
BEGIN
  SELECT role INTO caller_role
    FROM public.staff
   WHERE auth_user_id = auth.uid();

  IF caller_role IS NULL OR caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Owner role required to unlock a payroll run';
  END IF;

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

  -- locked_by / locked_at preserved so the UI can show "locked by Alice"
  -- alongside "last unlocked by Bob" until the next re-lock overwrites
  -- them. unlock_note records the reason for the most recent unlock.
  UPDATE public.schedule_payroll_runs
     SET status = 'review',
         unlocked_by = p_unlocker_staff_id,
         unlocked_at = now(),
         unlock_note = p_note
   WHERE id = p_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_payroll_unlock_run(uuid, uuid, text) TO authenticated;

-- =============================================================================
-- Fix 2B — RLS UPDATE policy split (status-aware)
-- =============================================================================
-- Replaces the prior single "manager/owner" UPDATE policy with two policies
-- that OR together:
--   * manager+owner can UPDATE only when both before AND after states are
--     in (draft, review)
--   * owner can UPDATE rows whose current status is one that the lock/unlock
--     RPCs touch (review or locked)
--
-- The RPCs run with SECURITY DEFINER so they bypass RLS entirely; this
-- policy is the secondary gate against direct-table writes. Without the
-- split, a manager calling `.update({ status: 'locked' })` directly via the
-- supabase client would succeed.
-- =============================================================================
DROP POLICY "schedule_payroll_runs update: manager/owner"
  ON public.schedule_payroll_runs;

CREATE POLICY "schedule_payroll_runs update: manager non-lock-states"
  ON public.schedule_payroll_runs FOR UPDATE
  TO authenticated
  USING (
    public.get_staff_role() IN ('manager', 'owner')
    AND status IN ('draft', 'review')
  )
  WITH CHECK (
    public.get_staff_role() IN ('manager', 'owner')
    AND status IN ('draft', 'review')
  );

CREATE POLICY "schedule_payroll_runs update: owner only locked transitions"
  ON public.schedule_payroll_runs FOR UPDATE
  TO authenticated
  USING (
    public.get_staff_role() = 'owner'
    AND status IN ('locked', 'review')
  )
  WITH CHECK (
    public.get_staff_role() = 'owner'
  );
