-- =============================================================================
-- Tigress — Web Push subscriptions (Session 15)
-- =============================================================================
-- Stores browser push subscriptions for members and staff. Each row represents
-- a single browser/device: a member on two phones and a laptop has three rows.
-- The `endpoint` is the push service URL and is unique globally — a
-- re-subscription from the same browser replaces the existing row via an
-- ON CONFLICT(endpoint) upsert in the data layer.
-- =============================================================================

CREATE TABLE public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  uuid REFERENCES public.members(id) ON DELETE CASCADE,
  staff_id   uuid REFERENCES public.staff(id)   ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (endpoint),
  CONSTRAINT push_subscriptions_must_have_owner
    CHECK (member_id IS NOT NULL OR staff_id IS NOT NULL)
);

CREATE INDEX push_subscriptions_member_idx
  ON public.push_subscriptions (member_id);

CREATE INDEX push_subscriptions_staff_idx
  ON public.push_subscriptions (staff_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- The service role (used by server actions that send notifications) bypasses
-- RLS, so these policies only scope the browser-facing anon/authenticated role.
-- Members and staff can manage ONLY their own subscription rows — never
-- anyone else's.

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ---------- SELECT ----------
CREATE POLICY "push_subscriptions select: self"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (
    (member_id IS NOT NULL AND member_id = public.get_member_id())
    OR (
      staff_id IS NOT NULL
      AND staff_id IN (
        SELECT id FROM public.staff WHERE auth_user_id = auth.uid()
      )
    )
  );

-- ---------- INSERT ----------
CREATE POLICY "push_subscriptions insert: self"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    (member_id IS NOT NULL AND member_id = public.get_member_id())
    OR (
      staff_id IS NOT NULL
      AND staff_id IN (
        SELECT id FROM public.staff WHERE auth_user_id = auth.uid()
      )
    )
  );

-- ---------- DELETE ----------
CREATE POLICY "push_subscriptions delete: self"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (
    (member_id IS NOT NULL AND member_id = public.get_member_id())
    OR (
      staff_id IS NOT NULL
      AND staff_id IN (
        SELECT id FROM public.staff WHERE auth_user_id = auth.uid()
      )
    )
  );

-- NOTE: No UPDATE policy. Re-subscribing deletes+inserts (via upsert), which
-- keeps the policy surface minimal and prevents ownership hand-off.
