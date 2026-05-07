-- =============================================================================
-- Tigress — Scheduling foundation (Session 25)
-- =============================================================================
-- First scheduling session: shift templates, FT standing templates,
-- PT availability submissions, weekly drafts, published shifts, and
-- per-user qualifications. The runtime layer (clock-in/out, swaps,
-- no-shows) lands in S26; payroll in S27.
--
-- Tables (all prefixed `schedule_*` except `user_qualifications`, which
-- is a generic many-to-many join we may reuse for non-scheduling
-- features):
--   schedule_shift_templates       — reusable shift definitions (AM/PM/...)
--   schedule_template_day_coverage — per-(template, day_of_week) requirements
--   user_qualifications            — many-to-many of staff -> qualification
--   schedule_ft_assignments        — FT standing templates (recurring weekly)
--   schedule_availability          — PT availability submissions per week
--   schedule_weeks                 — week-level container (draft/published/archived)
--   schedule_shifts                — actual assigned shift rows within a week
--
-- Identity convention: every user_id column references public.staff(id) — the
-- existing convention across this codebase. Members are not part of the
-- schedule.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- schedule_shift_templates
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_shift_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER schedule_shift_templates_updated_at
  BEFORE UPDATE ON public.schedule_shift_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_template_day_coverage
-- Per-day role requirements (jsonb { bartender: 1, floor: 1, mod: 1 }).
-- A missing row for (template, day_of_week) means the template doesn't run
-- that day.
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_template_day_coverage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid NOT NULL REFERENCES public.schedule_shift_templates(id) ON DELETE CASCADE,
  day_of_week       integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  role_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, day_of_week)
);

CREATE TRIGGER schedule_template_day_coverage_updated_at
  BEFORE UPDATE ON public.schedule_template_day_coverage
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- user_qualifications
-- One row per (staff, qualification) pair. Manager+owner editable.
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_qualifications (
  user_id       uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  qualification text NOT NULL CHECK (qualification IN ('bartender', 'floor', 'mod')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, qualification)
);

-- ---------------------------------------------------------------------------
-- schedule_ft_assignments
-- A recurring weekly assignment: "Sam works Mon AM as floor". Uses a
-- (effective_from, effective_until) window so we can change a contract
-- without rewriting history.
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_ft_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  template_id     uuid NOT NULL REFERENCES public.schedule_shift_templates(id) ON DELETE CASCADE,
  day_of_week     integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  role            text NOT NULL CHECK (role IN ('bartender', 'floor', 'mod')),
  effective_from  date NOT NULL,
  effective_until date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day_of_week, template_id, effective_from)
);

CREATE INDEX schedule_ft_assignments_user_idx
  ON public.schedule_ft_assignments (user_id);

CREATE TRIGGER schedule_ft_assignments_updated_at
  BEFORE UPDATE ON public.schedule_ft_assignments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_availability
-- PT availability submissions per week. Multiple blocks per day allowed.
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_availability (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  day_of_week     integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start_date, day_of_week, start_time, end_time)
);

CREATE INDEX schedule_availability_user_week_idx
  ON public.schedule_availability (user_id, week_start_date);

-- ---------------------------------------------------------------------------
-- schedule_weeks
-- Week-level container. One row per Monday-anchored week. Status drives
-- staff visibility — drafts are manager/owner only.
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_weeks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date       date NOT NULL UNIQUE,
  status                text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at          timestamptz,
  published_by          uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  publish_override_note text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER schedule_weeks_updated_at
  BEFORE UPDATE ON public.schedule_weeks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_shifts
-- The actual assigned shifts within a week. user_id NULL = unfilled slot
-- the manager scaffolded but hasn't yet assigned to a person.
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id     uuid NOT NULL REFERENCES public.schedule_weeks(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.schedule_shift_templates(id) ON DELETE RESTRICT,
  shift_date  date NOT NULL,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  user_id     uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  role        text NOT NULL CHECK (role IN ('bartender', 'floor', 'mod')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX schedule_shifts_week_idx
  ON public.schedule_shifts (week_id);

CREATE INDEX schedule_shifts_user_date_idx
  ON public.schedule_shifts (user_id, shift_date)
  WHERE user_id IS NOT NULL;

CREATE INDEX schedule_shifts_date_idx
  ON public.schedule_shifts (shift_date);

CREATE TRIGGER schedule_shifts_updated_at
  BEFORE UPDATE ON public.schedule_shifts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================================================
-- Helper: schedule_user_can_see_shift (defense-in-depth for draft hiding)
-- =============================================================================
-- Returns true if the calling auth user can see a shift row. Manager/owner
-- always; staff only when the parent week is published. Used from the RLS
-- policy on schedule_shifts so a stray SELECT can't leak a draft week.
CREATE OR REPLACE FUNCTION public.schedule_user_can_see_shift(p_week_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    public.get_staff_role() IN ('manager', 'owner')
    OR EXISTS (
      SELECT 1 FROM public.schedule_weeks w
      WHERE w.id = p_week_id AND w.status = 'published'
    );
$$;

GRANT EXECUTE ON FUNCTION public.schedule_user_can_see_shift(uuid) TO authenticated;

-- =============================================================================
-- Atomic RPCs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- schedule_publish_week — flips status, stamps published_at/by/note, all
-- inside one transaction. SECURITY INVOKER so the manager/owner write
-- policy on schedule_weeks gates the call.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_publish_week(
  p_week_id uuid,
  p_publisher_staff_id uuid,
  p_override_note text
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE public.schedule_weeks
     SET status = 'published',
         published_at = now(),
         published_by = p_publisher_staff_id,
         publish_override_note = p_override_note
   WHERE id = p_week_id
     AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'schedule_weeks row % is not in draft status', p_week_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_publish_week(uuid, uuid, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- schedule_unpublish_week — flips published -> draft, clears stamps.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_unpublish_week(p_week_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE public.schedule_weeks
     SET status = 'draft',
         published_at = NULL,
         published_by = NULL,
         publish_override_note = NULL
   WHERE id = p_week_id
     AND status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'schedule_weeks row % is not in published status', p_week_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_unpublish_week(uuid) TO authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.schedule_shift_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_template_day_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_qualifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_ft_assignments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_availability          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_weeks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_shifts                ENABLE ROW LEVEL SECURITY;

-- ---------- schedule_shift_templates ----------
CREATE POLICY "schedule_shift_templates select: authenticated"
  ON public.schedule_shift_templates FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "schedule_shift_templates write: manager/owner"
  ON public.schedule_shift_templates FOR ALL
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- schedule_template_day_coverage ----------
CREATE POLICY "schedule_template_day_coverage select: authenticated"
  ON public.schedule_template_day_coverage FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "schedule_template_day_coverage write: manager/owner"
  ON public.schedule_template_day_coverage FOR ALL
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- user_qualifications ----------
CREATE POLICY "user_qualifications select: authenticated"
  ON public.user_qualifications FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "user_qualifications write: manager/owner"
  ON public.user_qualifications FOR ALL
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- schedule_ft_assignments ----------
CREATE POLICY "schedule_ft_assignments select: self or manager/owner"
  ON public.schedule_ft_assignments FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR public.get_staff_role() IN ('manager', 'owner')
  );

CREATE POLICY "schedule_ft_assignments write: manager/owner"
  ON public.schedule_ft_assignments FOR ALL
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- schedule_availability ----------
CREATE POLICY "schedule_availability select: self or manager/owner"
  ON public.schedule_availability FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR public.get_staff_role() IN ('manager', 'owner')
  );

CREATE POLICY "schedule_availability insert: self or manager/owner"
  ON public.schedule_availability FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR public.get_staff_role() IN ('manager', 'owner')
  );

CREATE POLICY "schedule_availability update: self or manager/owner"
  ON public.schedule_availability FOR UPDATE
  TO authenticated
  USING (
    user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR public.get_staff_role() IN ('manager', 'owner')
  )
  WITH CHECK (
    user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR public.get_staff_role() IN ('manager', 'owner')
  );

CREATE POLICY "schedule_availability delete: self or manager/owner"
  ON public.schedule_availability FOR DELETE
  TO authenticated
  USING (
    user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    OR public.get_staff_role() IN ('manager', 'owner')
  );

-- ---------- schedule_weeks ----------
CREATE POLICY "schedule_weeks select: published or manager/owner"
  ON public.schedule_weeks FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    OR public.get_staff_role() IN ('manager', 'owner')
  );

CREATE POLICY "schedule_weeks write: manager/owner"
  ON public.schedule_weeks FOR ALL
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- schedule_shifts ----------
CREATE POLICY "schedule_shifts select: published or manager/owner"
  ON public.schedule_shifts FOR SELECT
  TO authenticated
  USING (public.schedule_user_can_see_shift(week_id));

CREATE POLICY "schedule_shifts write: manager/owner"
  ON public.schedule_shifts FOR ALL
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));
