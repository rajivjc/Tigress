-- =============================================================================
-- Tigress — Competitions foundation (Session 21)
-- =============================================================================
-- Everything in this migration is prefixed `comp_` and lives conceptually
-- inside the `src/competitions/` module. The module is designed to be
-- extractable as a standalone product later, so the prefix keeps discovery
-- trivial ("show me every comp_* table").
--
-- Nine tables:
--
--   comp_game_types           reference data (seeded, rarely changes)
--   comp_player_skills        integer 1..10 skill per member (displayed only)
--   comp_guests               non-member entrants (distinct from walk_in_guests)
--   comp_teams                named teams with a member captain
--   comp_team_members         current team roster
--   comp_competitions         tournaments, leagues, ladders, casual
--   comp_competition_entrants polymorphic entrants: member | guest | team
--   comp_matches              scheduled/in-progress/completed matches
--   comp_match_results        one-row-per-match result detail
--
-- Foundation-only: S21 ships the storage + a minimal owner admin. Bracket
-- generation, standings, registration UI, and feed auto-posts land in S22+.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- comp_game_types
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_game_types (
  id              text PRIMARY KEY,
  display_name    text NOT NULL,
  default_race_to integer NOT NULL CHECK (default_race_to BETWEEN 1 AND 100),
  rules_notes     text,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- comp_player_skills
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_player_skills (
  member_id            uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  skill_level          integer NOT NULL CHECK (skill_level BETWEEN 1 AND 10),
  updated_by_staff_id  uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- comp_guests
-- Distinct from walk_in_guests — different lifecycle, different purpose.
-- Provenance is XOR: either a member invited them, or staff registered them.
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_guests (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name             text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  email                    text,
  phone                    text,
  is_paying                boolean NOT NULL DEFAULT false,
  registered_by_member_id  uuid REFERENCES public.members(id) ON DELETE SET NULL,
  registered_by_staff_id   uuid REFERENCES public.staff(id)   ON DELETE SET NULL,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  archived_at              timestamptz,

  CONSTRAINT comp_guests_provenance CHECK (
    (registered_by_member_id IS NOT NULL AND registered_by_staff_id IS NULL)
    OR
    (registered_by_member_id IS NULL AND registered_by_staff_id IS NOT NULL)
  )
);

CREATE INDEX comp_guests_active_idx
  ON public.comp_guests (created_at DESC)
  WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- comp_teams
-- Captain is always a member. Updated via trigger.
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_teams (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  captain_member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comp_teams_status_idx ON public.comp_teams (status);

CREATE TRIGGER comp_teams_updated_at
  BEFORE UPDATE ON public.comp_teams
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- comp_team_members
-- Roster is "current state" — historical lineups for completed matches are
-- inferred from per-match lineup records (added in S23).
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_team_members (
  team_id    uuid NOT NULL REFERENCES public.comp_teams(id) ON DELETE CASCADE,
  member_id  uuid NOT NULL REFERENCES public.members(id)    ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, member_id)
);

-- ---------------------------------------------------------------------------
-- comp_competitions
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_competitions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description            text,
  kind                   text NOT NULL
                         CHECK (kind IN ('tournament', 'league', 'ladder', 'casual')),
  format                 text
                         CHECK (format IN ('single_elim', 'double_elim', 'round_robin', 'swiss')),
  entrant_type           text NOT NULL
                         CHECK (entrant_type IN ('individual', 'team')),
  game_type_id           text NOT NULL REFERENCES public.comp_game_types(id) ON DELETE RESTRICT,
  guest_policy           text NOT NULL DEFAULT 'members_only'
                         CHECK (guest_policy IN ('members_only', 'invited_guests', 'paying_guests', 'both_guest_types')),
  team_match_config      jsonb,
  status                 text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'registration_open', 'in_progress', 'completed', 'cancelled')),
  registration_opens_at  timestamptz,
  registration_closes_at timestamptz,
  starts_at              timestamptz,
  ends_at                timestamptz,
  created_by_staff_id    uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT comp_competitions_format_required CHECK (
    (kind = 'tournament' AND format IS NOT NULL)
    OR
    (kind IN ('league', 'ladder', 'casual') AND format IS NULL)
  ),
  CONSTRAINT comp_competitions_league_team CHECK (
    kind <> 'league' OR entrant_type = 'team'
  )
);

CREATE INDEX comp_competitions_status_idx
  ON public.comp_competitions (status, starts_at DESC);

CREATE INDEX comp_competitions_kind_idx
  ON public.comp_competitions (kind);

CREATE TRIGGER comp_competitions_updated_at
  BEFORE UPDATE ON public.comp_competitions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- comp_competition_entrants
-- Polymorphic: exactly one of (member, guest, team). Partial unique indexes
-- enforce one-entrant-per-(competition, subject).
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_competition_entrants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id    uuid NOT NULL REFERENCES public.comp_competitions(id) ON DELETE CASCADE,
  entrant_member_id uuid REFERENCES public.members(id)       ON DELETE RESTRICT,
  entrant_guest_id  uuid REFERENCES public.comp_guests(id)   ON DELETE RESTRICT,
  entrant_team_id   uuid REFERENCES public.comp_teams(id)    ON DELETE RESTRICT,
  seed_number       integer,
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'withdrawn', 'eliminated')),
  registered_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT comp_entrants_exactly_one_ref CHECK (
    (CASE WHEN entrant_member_id IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN entrant_guest_id  IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN entrant_team_id   IS NOT NULL THEN 1 ELSE 0 END)
    = 1
  )
);

CREATE UNIQUE INDEX comp_entrants_unique_member
  ON public.comp_competition_entrants (competition_id, entrant_member_id)
  WHERE entrant_member_id IS NOT NULL;

CREATE UNIQUE INDEX comp_entrants_unique_guest
  ON public.comp_competition_entrants (competition_id, entrant_guest_id)
  WHERE entrant_guest_id IS NOT NULL;

CREATE UNIQUE INDEX comp_entrants_unique_team
  ON public.comp_competition_entrants (competition_id, entrant_team_id)
  WHERE entrant_team_id IS NOT NULL;

CREATE INDEX comp_entrants_competition_idx
  ON public.comp_competition_entrants (competition_id);

CREATE UNIQUE INDEX comp_entrants_seed_unique
  ON public.comp_competition_entrants (competition_id, seed_number)
  WHERE seed_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- comp_matches
-- Both sides reference entrants (not players directly) so guests and teams
-- work uniformly. `parent_match_id` links sub-matches of a team match.
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_matches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id    uuid NOT NULL REFERENCES public.comp_competitions(id)        ON DELETE CASCADE,
  entrant_a_id      uuid NOT NULL REFERENCES public.comp_competition_entrants(id) ON DELETE RESTRICT,
  entrant_b_id      uuid NOT NULL REFERENCES public.comp_competition_entrants(id) ON DELETE RESTRICT,
  game_type_id      text NOT NULL REFERENCES public.comp_game_types(id)          ON DELETE RESTRICT,
  race_to_a         integer NOT NULL CHECK (race_to_a BETWEEN 1 AND 100),
  race_to_b         integer NOT NULL CHECK (race_to_b BETWEEN 1 AND 100),
  round_number      integer,
  bracket_position  integer,
  parent_match_id   uuid REFERENCES public.comp_matches(id) ON DELETE CASCADE,
  scheduled_at      timestamptz,
  booking_id        uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'forfeited', 'disputed')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT comp_matches_distinct_entrants CHECK (entrant_a_id <> entrant_b_id)
);

CREATE INDEX comp_matches_competition_idx
  ON public.comp_matches (competition_id, scheduled_at);

CREATE INDEX comp_matches_parent_idx
  ON public.comp_matches (parent_match_id)
  WHERE parent_match_id IS NOT NULL;

CREATE INDEX comp_matches_status_idx
  ON public.comp_matches (status);

CREATE INDEX comp_matches_booking_idx
  ON public.comp_matches (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE TRIGGER comp_matches_updated_at
  BEFORE UPDATE ON public.comp_matches
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- comp_match_results
-- PK on match_id guarantees one result row per match. Kept separate from
-- comp_matches so in-flight matches don't carry unused score fields.
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_match_results (
  match_id                  uuid PRIMARY KEY REFERENCES public.comp_matches(id) ON DELETE CASCADE,
  winner_entrant_id         uuid NOT NULL REFERENCES public.comp_competition_entrants(id) ON DELETE RESTRICT,
  score_a                   integer NOT NULL CHECK (score_a >= 0),
  score_b                   integer NOT NULL CHECK (score_b >= 0),
  broken_by_entrant_id      uuid REFERENCES public.comp_competition_entrants(id) ON DELETE SET NULL,
  flags                     jsonb NOT NULL DEFAULT '{}'::jsonb,
  reported_by_auth_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_at               timestamptz NOT NULL DEFAULT now(),
  verified_by_staff_id      uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  verified_at               timestamptz,
  notes                     text
);

CREATE INDEX comp_match_results_winner_idx
  ON public.comp_match_results (winner_entrant_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Reads are broadly permissive (authenticated) so the module can query freely.
-- Writes in S21 are owner/manager only, with a small window for captains to
-- mutate their own team. Member-self-registration and captain/winner result
-- reporting paths land in S22–S23.
-- =============================================================================

ALTER TABLE public.comp_game_types             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_player_skills          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_guests                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_teams                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_team_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_competitions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_competition_entrants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_matches                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_match_results          ENABLE ROW LEVEL SECURITY;

-- ---------- comp_game_types ----------
CREATE POLICY "comp_game_types select: authenticated"
  ON public.comp_game_types FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_game_types insert: owner"
  ON public.comp_game_types FOR INSERT
  TO authenticated WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "comp_game_types update: owner"
  ON public.comp_game_types FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() = 'owner')
  WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "comp_game_types delete: owner"
  ON public.comp_game_types FOR DELETE
  TO authenticated USING (public.get_staff_role() = 'owner');

-- ---------- comp_player_skills ----------
CREATE POLICY "comp_player_skills select: authenticated"
  ON public.comp_player_skills FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_player_skills insert: manager/owner"
  ON public.comp_player_skills FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_player_skills update: manager/owner"
  ON public.comp_player_skills FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_player_skills delete: manager/owner"
  ON public.comp_player_skills FOR DELETE
  TO authenticated USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- comp_guests ----------
CREATE POLICY "comp_guests select: authenticated"
  ON public.comp_guests FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_guests insert: staff"
  ON public.comp_guests FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "comp_guests update: staff"
  ON public.comp_guests FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "comp_guests delete: manager/owner"
  ON public.comp_guests FOR DELETE
  TO authenticated USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- comp_teams ----------
CREATE POLICY "comp_teams select: authenticated"
  ON public.comp_teams FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_teams insert: manager/owner"
  ON public.comp_teams FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_teams update: manager/owner or captain"
  ON public.comp_teams FOR UPDATE
  TO authenticated
  USING (
    public.get_staff_role() IN ('manager', 'owner')
    OR captain_member_id = public.get_member_id()
  )
  WITH CHECK (
    public.get_staff_role() IN ('manager', 'owner')
    OR captain_member_id = public.get_member_id()
  );

CREATE POLICY "comp_teams delete: manager/owner"
  ON public.comp_teams FOR DELETE
  TO authenticated USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- comp_team_members ----------
CREATE POLICY "comp_team_members select: authenticated"
  ON public.comp_team_members FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_team_members insert: manager/owner or captain"
  ON public.comp_team_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_staff_role() IN ('manager', 'owner')
    OR EXISTS (
      SELECT 1 FROM public.comp_teams t
      WHERE t.id = team_id
        AND t.captain_member_id = public.get_member_id()
    )
  );

CREATE POLICY "comp_team_members delete: manager/owner or captain"
  ON public.comp_team_members FOR DELETE
  TO authenticated
  USING (
    public.get_staff_role() IN ('manager', 'owner')
    OR EXISTS (
      SELECT 1 FROM public.comp_teams t
      WHERE t.id = team_id
        AND t.captain_member_id = public.get_member_id()
    )
  );

-- ---------- comp_competitions ----------
CREATE POLICY "comp_competitions select: authenticated"
  ON public.comp_competitions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_competitions insert: manager/owner"
  ON public.comp_competitions FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_competitions update: manager/owner"
  ON public.comp_competitions FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_competitions delete: manager/owner"
  ON public.comp_competitions FOR DELETE
  TO authenticated USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- comp_competition_entrants ----------
CREATE POLICY "comp_entrants select: authenticated"
  ON public.comp_competition_entrants FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_entrants insert: manager/owner"
  ON public.comp_competition_entrants FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_entrants update: manager/owner"
  ON public.comp_competition_entrants FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_entrants delete: manager/owner"
  ON public.comp_competition_entrants FOR DELETE
  TO authenticated USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- comp_matches ----------
CREATE POLICY "comp_matches select: authenticated"
  ON public.comp_matches FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_matches insert: manager/owner"
  ON public.comp_matches FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_matches update: manager/owner"
  ON public.comp_matches FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_matches delete: manager/owner"
  ON public.comp_matches FOR DELETE
  TO authenticated USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- comp_match_results ----------
CREATE POLICY "comp_match_results select: authenticated"
  ON public.comp_match_results FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_match_results insert: manager/owner"
  ON public.comp_match_results FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_match_results update: manager/owner"
  ON public.comp_match_results FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_match_results delete: manager/owner"
  ON public.comp_match_results FOR DELETE
  TO authenticated USING (public.get_staff_role() IN ('manager', 'owner'));

-- =============================================================================
-- Seed data
-- =============================================================================

INSERT INTO public.comp_game_types (id, display_name, default_race_to, sort_order, rules_notes) VALUES
  ('eight_ball',  '8-ball',                5,  10, 'WPA rules, ball-in-hand on foul'),
  ('nine_ball',   '9-ball',                7,  20, 'Rotation, call pocket on 9'),
  ('ten_ball',    '10-ball',               5,  30, 'Call shot, call pocket'),
  ('straight',    'Straight pool (14.1)',  75, 40, 'Race to N total balls'),
  ('one_pocket',  'One-pocket',            3,  50, 'Each player owns one corner pocket'),
  ('bank_pool',   'Bank pool',             3,  60, 'Every shot must be banked');
