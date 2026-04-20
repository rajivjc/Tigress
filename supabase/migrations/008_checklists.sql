-- =============================================================================
-- Tigress — Daily checklists & SOPs (Session 18)
-- =============================================================================
-- Staff operational checklists. Manager/owner creates reusable templates with
-- ordered items; each day those templates are materialised into per-date
-- instances that staff tick off. Item labels and descriptions are COPIED from
-- the template into the instance at creation time so editing a template later
-- does not retroactively rewrite historical checklists.
--
-- Four tables:
--   checklist_templates       — reusable definitions (Opening, Closing, ...)
--   checklist_template_items  — ordered items within a template
--   checklist_instances       — one per (template, date), generated lazily
--   checklist_instance_items  — copied items that staff check off
-- =============================================================================

-- ---------------------------------------------------------------------------
-- checklist_templates
-- ---------------------------------------------------------------------------
CREATE TABLE public.checklist_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  category    text NOT NULL DEFAULT 'daily'
    CHECK (category IN ('daily', 'weekly', 'ad_hoc')),
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES public.staff(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TRIGGER checklist_templates_updated_at
  BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- checklist_template_items
-- ---------------------------------------------------------------------------
CREATE TABLE public.checklist_template_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  label       text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_checklist_template_items_template
  ON public.checklist_template_items (template_id, sort_order);

-- ---------------------------------------------------------------------------
-- checklist_instances
-- One per (template, date). Created lazily on first access.
-- ---------------------------------------------------------------------------
CREATE TABLE public.checklist_instances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  date         date NOT NULL,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.staff(id),
  created_at   timestamptz DEFAULT now(),
  UNIQUE (template_id, date)
);

CREATE INDEX idx_checklist_instances_date
  ON public.checklist_instances (date);

-- ---------------------------------------------------------------------------
-- checklist_instance_items
-- Label / description are COPIED from the template at creation time so
-- historical records reflect exactly what staff saw on that day.
-- template_item_id is kept for traceability but goes NULL when the template
-- item is deleted so historical instances survive template edits.
-- ---------------------------------------------------------------------------
CREATE TABLE public.checklist_instance_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id      uuid NOT NULL REFERENCES public.checklist_instances(id) ON DELETE CASCADE,
  template_item_id uuid REFERENCES public.checklist_template_items(id) ON DELETE SET NULL,
  label            text NOT NULL,
  description      text,
  sort_order       integer NOT NULL DEFAULT 0,
  checked          boolean NOT NULL DEFAULT false,
  checked_by       uuid REFERENCES public.staff(id),
  checked_at       timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_checklist_instance_items_instance
  ON public.checklist_instance_items (instance_id, sort_order);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Checklists are a staff-only concept. Members see nothing.
--   staff        — read everything, write only instance item checkmarks
--   manager/owner — full CRUD on templates + items

ALTER TABLE public.checklist_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_instances       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_instance_items  ENABLE ROW LEVEL SECURITY;

-- ---------- checklist_templates ----------
CREATE POLICY "checklist_templates select: staff"
  ON public.checklist_templates FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "checklist_templates insert: manager/owner"
  ON public.checklist_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "checklist_templates update: manager/owner"
  ON public.checklist_templates FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "checklist_templates delete: manager/owner"
  ON public.checklist_templates FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- checklist_template_items ----------
CREATE POLICY "checklist_template_items select: staff"
  ON public.checklist_template_items FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "checklist_template_items insert: manager/owner"
  ON public.checklist_template_items FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "checklist_template_items update: manager/owner"
  ON public.checklist_template_items FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "checklist_template_items delete: manager/owner"
  ON public.checklist_template_items FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- checklist_instances ----------
-- Any staff can create a daily instance (lazy generation on first visit).
CREATE POLICY "checklist_instances select: staff"
  ON public.checklist_instances FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "checklist_instances insert: staff"
  ON public.checklist_instances FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "checklist_instances update: staff"
  ON public.checklist_instances FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "checklist_instances delete: manager/owner"
  ON public.checklist_instances FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- checklist_instance_items ----------
CREATE POLICY "checklist_instance_items select: staff"
  ON public.checklist_instance_items FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "checklist_instance_items insert: staff"
  ON public.checklist_instance_items FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "checklist_instance_items update: staff"
  ON public.checklist_instance_items FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "checklist_instance_items delete: manager/owner"
  ON public.checklist_instance_items FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));
