-- =============================================================================
-- Tigress — Social feed (Session 20)
-- =============================================================================
-- Community feed shared across members and staff. A single posts table with
-- polymorphic authorship:
--   - human author (member OR staff — XOR), system_generated = false
--   - system author (both author_*_id null), system_generated = true
-- The system_generated = true path is scaffolding for future tournament
-- results and achievement unlocks; no auto-post logic is wired in this session.
--
-- Posts are soft-deleted via `deleted_at`. RLS blocks direct UPDATE/DELETE on
-- posts — the `deletePostAction` server action uses the service role (in real
-- mode) so moderation can't be subverted by a crafted client call.
--
-- `post_likes` is a simple many-to-many with the same member-XOR-staff pattern
-- on the liker side. The pair of partial-unique indexes enforces idempotency.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
CREATE TABLE public.posts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_member_id     uuid REFERENCES public.members(id) ON DELETE SET NULL,
  author_staff_id      uuid REFERENCES public.staff(id)   ON DELETE SET NULL,
  system_generated     boolean NOT NULL DEFAULT false,
  body                 text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  media_type           text NOT NULL DEFAULT 'none'
                       CHECK (media_type IN ('none', 'youtube', 'image')),
  media_url            text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  deleted_by_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  deleted_by_staff_id  uuid REFERENCES public.staff(id)   ON DELETE SET NULL,

  CONSTRAINT posts_authorship CHECK (
    (system_generated = true  AND author_member_id IS NULL AND author_staff_id IS NULL)
    OR
    (system_generated = false AND (
      (author_member_id IS NOT NULL AND author_staff_id IS NULL)
      OR
      (author_member_id IS NULL AND author_staff_id IS NOT NULL)
    ))
  ),

  CONSTRAINT posts_media CHECK (
    (media_type = 'none' AND media_url IS NULL)
    OR
    (media_type IN ('youtube', 'image') AND media_url IS NOT NULL)
  )
);

-- Feed pagination orders by created_at DESC and skips deleted rows — the
-- partial index keeps the hot path off deleted data.
CREATE INDEX posts_feed_idx
  ON public.posts (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX posts_author_member_idx
  ON public.posts (author_member_id)
  WHERE deleted_at IS NULL;

CREATE INDEX posts_author_staff_idx
  ON public.posts (author_staff_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- post_likes
-- ---------------------------------------------------------------------------
CREATE TABLE public.post_likes (
  post_id         uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  liker_member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  liker_staff_id  uuid REFERENCES public.staff(id)   ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT post_likes_liker CHECK (
    (liker_member_id IS NOT NULL AND liker_staff_id IS NULL)
    OR
    (liker_member_id IS NULL AND liker_staff_id IS NOT NULL)
  )
);

-- Per-liker uniqueness: a member can only like a given post once, and
-- likewise for a staff user. We use two partial unique indexes rather than a
-- composite because the liker columns are nullable (XOR).
CREATE UNIQUE INDEX post_likes_member_unique
  ON public.post_likes (post_id, liker_member_id)
  WHERE liker_member_id IS NOT NULL;

CREATE UNIQUE INDEX post_likes_staff_unique
  ON public.post_likes (post_id, liker_staff_id)
  WHERE liker_staff_id IS NOT NULL;

-- Look-up index for the correlated like-count subquery in the feed query.
CREATE INDEX post_likes_post_idx ON public.post_likes (post_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Any authenticated user (member or staff) can read the feed. Writes are
-- scoped to the row's own author/liker id via the get_member_id() /
-- get_staff_role() helpers defined in 001_initial_schema.sql.
--
-- UPDATE and DELETE on `posts` are intentionally not covered by a policy —
-- soft-deletes go through the `deletePostAction` server action (service role
-- in real mode), which enforces manager/owner-or-author authorisation in
-- application code. Leaving these operations uncovered means they're denied
-- by default for the anon/authenticated roles.

ALTER TABLE public.posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes  ENABLE ROW LEVEL SECURITY;

-- ---------- posts: SELECT ----------
CREATE POLICY "posts select: authenticated, non-deleted"
  ON public.posts FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- ---------- posts: INSERT ----------
CREATE POLICY "posts insert: member self-author"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (
    system_generated = false
    AND author_member_id IS NOT NULL
    AND author_staff_id IS NULL
    AND author_member_id = public.get_member_id()
  );

CREATE POLICY "posts insert: staff self-author"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (
    system_generated = false
    AND author_staff_id IS NOT NULL
    AND author_member_id IS NULL
    AND public.get_staff_role() IN ('staff', 'manager', 'owner')
    AND author_staff_id IN (
      SELECT id FROM public.staff WHERE auth_user_id = auth.uid()
    )
  );

-- ---------- post_likes: SELECT ----------
CREATE POLICY "post_likes select: authenticated"
  ON public.post_likes FOR SELECT
  TO authenticated
  USING (true);

-- ---------- post_likes: INSERT ----------
CREATE POLICY "post_likes insert: member self-liker"
  ON public.post_likes FOR INSERT
  TO authenticated
  WITH CHECK (
    liker_member_id IS NOT NULL
    AND liker_staff_id IS NULL
    AND liker_member_id = public.get_member_id()
  );

CREATE POLICY "post_likes insert: staff self-liker"
  ON public.post_likes FOR INSERT
  TO authenticated
  WITH CHECK (
    liker_staff_id IS NOT NULL
    AND liker_member_id IS NULL
    AND public.get_staff_role() IN ('staff', 'manager', 'owner')
    AND liker_staff_id IN (
      SELECT id FROM public.staff WHERE auth_user_id = auth.uid()
    )
  );

-- ---------- post_likes: DELETE ----------
CREATE POLICY "post_likes delete: member self-liker"
  ON public.post_likes FOR DELETE
  TO authenticated
  USING (
    liker_member_id IS NOT NULL
    AND liker_member_id = public.get_member_id()
  );

CREATE POLICY "post_likes delete: staff self-liker"
  ON public.post_likes FOR DELETE
  TO authenticated
  USING (
    liker_staff_id IS NOT NULL
    AND liker_staff_id IN (
      SELECT id FROM public.staff WHERE auth_user_id = auth.uid()
    )
  );
