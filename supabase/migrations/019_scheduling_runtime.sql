-- =============================================================================
-- Tigress — Scheduling runtime + S25 atomicity & RLS fixes (Session 26)
-- =============================================================================
-- Layers the runtime concerns on top of the S25 foundation:
--   * Clock-in/out (honor system) with manager-driven rounding + lock
--   * Staff-initiated correction requests, manager-approved
--   * Direct swaps + giveaway marketplace under one
--     schedule_shift_change_requests table
--   * Manual no-show / excused-absence flags
--   * Per-shift dedup table for the 1h pre-shift push reminder
--
-- Plus three S25 follow-ups folded in:
--   * Atomic create-week + copy-from-previous-week RPCs (S25 Finding 2 & 1)
--   * Atomic clock lock + swap-accept RPCs
--   * RLS tightening on schedule_weeks + schedule_user_can_see_shift
--     (S25 Finding 3 — explicit role membership check)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- schedule_clock_records
-- One row per (shift, user). Created on clock-in.
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_clock_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id          uuid NOT NULL REFERENCES public.schedule_shifts(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  clocked_in_at     timestamptz NOT NULL,
  clocked_out_at    timestamptz,
  status            text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending_review', 'locked')),
  locked_at         timestamptz,
  locked_by         uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  unlock_note       text,
  manager_edited    boolean NOT NULL DEFAULT false,
  manager_edit_note text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shift_id, user_id)
);

CREATE INDEX schedule_clock_records_user_status_idx
  ON public.schedule_clock_records (user_id, status);

CREATE INDEX schedule_clock_records_shift_idx
  ON public.schedule_clock_records (shift_id);

CREATE TRIGGER schedule_clock_records_updated_at
  BEFORE UPDATE ON public.schedule_clock_records
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_clock_corrections
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_clock_corrections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clock_record_id          uuid NOT NULL REFERENCES public.schedule_clock_records(id) ON DELETE CASCADE,
  requested_by             uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  proposed_clocked_in_at   timestamptz,
  proposed_clocked_out_at  timestamptz,
  reason                   text NOT NULL,
  status                   text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  resolved_by              uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  resolved_at              timestamptz,
  resolution_note          text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX schedule_clock_corrections_status_idx
  ON public.schedule_clock_corrections (status, created_at);

CREATE INDEX schedule_clock_corrections_record_idx
  ON public.schedule_clock_corrections (clock_record_id);

CREATE TRIGGER schedule_clock_corrections_updated_at
  BEFORE UPDATE ON public.schedule_clock_corrections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_shift_change_requests
-- Direct swaps + giveaways under one table, discriminated by `kind`.
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_shift_change_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('direct_swap', 'giveaway')),
  shift_id        uuid NOT NULL REFERENCES public.schedule_shifts(id) ON DELETE CASCADE,
  requested_by    uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  target_user_id  uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'reversed')),
  accepted_by     uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  reversal_note   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'direct_swap' AND target_user_id IS NOT NULL)
    OR (kind = 'giveaway'  AND target_user_id IS NULL)
  )
);

CREATE INDEX schedule_shift_change_requests_shift_idx
  ON public.schedule_shift_change_requests (shift_id);

CREATE INDEX schedule_shift_change_requests_status_kind_idx
  ON public.schedule_shift_change_requests (status, kind);

CREATE INDEX schedule_shift_change_requests_target_idx
  ON public.schedule_shift_change_requests (target_user_id, status)
  WHERE kind = 'direct_swap';

CREATE TRIGGER schedule_shift_change_requests_updated_at
  BEFORE UPDATE ON public.schedule_shift_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_shift_attendance
-- Per-shift status flag. Absence-of-row = expected.
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_shift_attendance (
  shift_id          uuid PRIMARY KEY REFERENCES public.schedule_shifts(id) ON DELETE CASCADE,
  attendance_status text NOT NULL CHECK (attendance_status IN ('expected', 'excused', 'no_show')),
  marked_by         uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  marked_at         timestamptz,
  note              text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER schedule_shift_attendance_updated_at
  BEFORE UPDATE ON public.schedule_shift_attendance
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_shift_notifications_sent
-- Idempotency guard for the 1h pre-shift cron push.
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_shift_notifications_sent (
  shift_id  uuid NOT NULL REFERENCES public.schedule_shifts(id) ON DELETE CASCADE,
  kind      text NOT NULL CHECK (kind IN ('one_hour_warning')),
  sent_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shift_id, kind)
);

-- =============================================================================
-- S25 RLS tightening: explicit staff/manager/owner role check on schedule_weeks
-- and schedule_user_can_see_shift. Previously a NULL get_staff_role() (e.g.
-- service-role bypass aside, anything without a staff row) could SELECT
-- published weeks via the OR branch.
-- =============================================================================

DROP POLICY IF EXISTS "schedule_weeks select: published or manager/owner"
  ON public.schedule_weeks;

CREATE POLICY "schedule_weeks select: staff/manager/owner"
  ON public.schedule_weeks FOR SELECT
  TO authenticated
  USING (
    public.get_staff_role() IN ('staff', 'manager', 'owner')
    AND (status = 'published' OR public.get_staff_role() IN ('manager', 'owner'))
  );

CREATE OR REPLACE FUNCTION public.schedule_user_can_see_shift(p_week_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    public.get_staff_role() IN ('staff', 'manager', 'owner')
    AND (
      public.get_staff_role() IN ('manager', 'owner')
      OR EXISTS (
        SELECT 1 FROM public.schedule_weeks w
        WHERE w.id = p_week_id AND w.status = 'published'
      )
    );
$$;

-- =============================================================================
-- Atomic RPCs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- schedule_create_week — inserts the week row + materialised draft shifts
-- in one transaction. Bulk insert from a JSON payload of draft rows. The
-- caller resolves materialisation; this function only persists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_create_week(
  p_week_start_date date,
  p_drafts jsonb
) RETURNS public.schedule_weeks
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  new_week public.schedule_weeks;
BEGIN
  INSERT INTO public.schedule_weeks (week_start_date, status)
       VALUES (p_week_start_date, 'draft')
    RETURNING * INTO new_week;

  IF jsonb_array_length(COALESCE(p_drafts, '[]'::jsonb)) > 0 THEN
    INSERT INTO public.schedule_shifts (
      week_id, template_id, shift_date, start_time, end_time, role, user_id
    )
    SELECT
      new_week.id,
      (d->>'template_id')::uuid,
      (d->>'shift_date')::date,
      (d->>'start_time')::time,
      (d->>'end_time')::time,
      d->>'role',
      NULLIF(d->>'user_id', '')::uuid
    FROM jsonb_array_elements(p_drafts) d;
  END IF;

  RETURN new_week;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_create_week(date, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- schedule_copy_from_previous_week — wraps create + carryover-shifts in one
-- transaction. Carryover rows have already been resolved (qualifications +
-- date shifts) by the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_copy_from_previous_week(
  p_new_ws date,
  p_prev_ws date,
  p_drafts jsonb,
  p_carryovers jsonb
) RETURNS public.schedule_weeks
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  new_week public.schedule_weeks;
BEGIN
  -- Sanity check: the previous week the caller fetched should still exist.
  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_weeks WHERE week_start_date = p_prev_ws
  ) THEN
    RAISE EXCEPTION 'Previous week % not found', p_prev_ws;
  END IF;

  new_week := public.schedule_create_week(p_new_ws, p_drafts);

  IF jsonb_array_length(COALESCE(p_carryovers, '[]'::jsonb)) > 0 THEN
    INSERT INTO public.schedule_shifts (
      week_id, template_id, shift_date, start_time, end_time, role, user_id
    )
    SELECT
      new_week.id,
      (c->>'template_id')::uuid,
      (c->>'shift_date')::date,
      (c->>'start_time')::time,
      (c->>'end_time')::time,
      c->>'role',
      NULLIF(c->>'user_id', '')::uuid
    FROM jsonb_array_elements(p_carryovers) c;
  END IF;

  RETURN new_week;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_copy_from_previous_week(date, date, jsonb, jsonb)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- schedule_lock_clock_records — bulk transition pending_review -> locked.
-- All-or-nothing: any record not in pending_review aborts the whole call.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_lock_clock_records(
  p_record_ids uuid[],
  p_locker_staff_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  bad_count integer;
  updated_count integer;
BEGIN
  IF p_record_ids IS NULL OR array_length(p_record_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO bad_count
  FROM public.schedule_clock_records
  WHERE id = ANY(p_record_ids)
    AND status <> 'pending_review';

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'One or more clock records are not in pending_review status';
  END IF;

  UPDATE public.schedule_clock_records
     SET status = 'locked',
         locked_at = now(),
         locked_by = p_locker_staff_id,
         unlock_note = NULL
   WHERE id = ANY(p_record_ids);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_lock_clock_records(uuid[], uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- schedule_accept_swap — atomically updates the request status AND the
-- parent shift's user_id. Validates the request is still pending and the
-- caller is a permitted acceptor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_accept_swap(
  p_request_id uuid,
  p_acceptor_staff_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  req public.schedule_shift_change_requests;
BEGIN
  SELECT * INTO req
    FROM public.schedule_shift_change_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap request % not found', p_request_id;
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'Swap request % is not pending', p_request_id;
  END IF;
  IF req.kind = 'direct_swap' AND req.target_user_id <> p_acceptor_staff_id THEN
    RAISE EXCEPTION 'Acceptor is not the targeted user';
  END IF;

  UPDATE public.schedule_shift_change_requests
     SET status = 'accepted',
         accepted_by = p_acceptor_staff_id,
         resolved_at = now()
   WHERE id = p_request_id;

  UPDATE public.schedule_shifts
     SET user_id = p_acceptor_staff_id
   WHERE id = req.shift_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_accept_swap(uuid, uuid) TO authenticated;

-- =============================================================================
-- Row Level Security on the new tables
-- =============================================================================

ALTER TABLE public.schedule_clock_records             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_clock_corrections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_shift_change_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_shift_attendance          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_shift_notifications_sent  ENABLE ROW LEVEL SECURITY;

-- ---------- schedule_clock_records ----------
CREATE POLICY "schedule_clock_records select: self or manager/owner"
  ON public.schedule_clock_records FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR public.get_staff_role() IN ('manager', 'owner')
  );

CREATE POLICY "schedule_clock_records insert: self or manager/owner"
  ON public.schedule_clock_records FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR public.get_staff_role() IN ('manager', 'owner')
  );

CREATE POLICY "schedule_clock_records update: self pre-lock or manager/owner"
  ON public.schedule_clock_records FOR UPDATE
  TO authenticated
  USING (
    public.get_staff_role() IN ('manager', 'owner')
    OR (
      status <> 'locked'
      AND user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    )
  )
  WITH CHECK (
    public.get_staff_role() IN ('manager', 'owner')
    OR (
      status <> 'locked'
      AND user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    )
  );

-- ---------- schedule_clock_corrections ----------
CREATE POLICY "schedule_clock_corrections select: self or manager/owner"
  ON public.schedule_clock_corrections FOR SELECT
  TO authenticated
  USING (
    requested_by IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR public.get_staff_role() IN ('manager', 'owner')
  );

CREATE POLICY "schedule_clock_corrections insert: self only"
  ON public.schedule_clock_corrections FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "schedule_clock_corrections update: manager/owner"
  ON public.schedule_clock_corrections FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- schedule_shift_change_requests ----------
-- Read: requester / target see direct swaps; giveaways visible to all staff.
-- Write: requester for create/cancel; target for accept/decline; any staff
-- for claim (giveaway only); manager/owner full access.
CREATE POLICY "schedule_shift_change_requests select: marketplace + parties"
  ON public.schedule_shift_change_requests FOR SELECT
  TO authenticated
  USING (
    public.get_staff_role() IN ('manager', 'owner')
    OR kind = 'giveaway'
    OR requested_by IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR target_user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "schedule_shift_change_requests insert: self request"
  ON public.schedule_shift_change_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR public.get_staff_role() IN ('manager', 'owner')
  );

CREATE POLICY "schedule_shift_change_requests update: parties + manager"
  ON public.schedule_shift_change_requests FOR UPDATE
  TO authenticated
  USING (
    public.get_staff_role() IN ('manager', 'owner')
    OR requested_by IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR target_user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR (
      kind = 'giveaway'
      AND public.get_staff_role() IN ('staff', 'manager', 'owner')
    )
  )
  WITH CHECK (
    public.get_staff_role() IN ('manager', 'owner')
    OR requested_by IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR target_user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR (
      kind = 'giveaway'
      AND public.get_staff_role() IN ('staff', 'manager', 'owner')
    )
  );

-- ---------- schedule_shift_attendance ----------
CREATE POLICY "schedule_shift_attendance select: staff/manager/owner"
  ON public.schedule_shift_attendance FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "schedule_shift_attendance write: manager/owner"
  ON public.schedule_shift_attendance FOR ALL
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- schedule_shift_notifications_sent ----------
-- Server-driven only — service role bypasses RLS. No policies allow any
-- non-service writer.
CREATE POLICY "schedule_shift_notifications_sent select: manager/owner"
  ON public.schedule_shift_notifications_sent FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));
