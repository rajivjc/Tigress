-- =============================================================================
-- Tigress — League foundation (Session 23)
-- =============================================================================
-- Second playable competition format. Adds five new tables (comp_seasons,
-- comp_divisions, comp_fixtures, comp_fixture_participants, comp_match_lineups)
-- plus modifications to comp_matches and comp_competitions.
--
-- S23 implements a single supported league config (flexible fixtures, strict
-- lineup, 3-1-0 points, head-to-head + sub-match-diff tiebreakers). The
-- configuration-validation + standings-computation engine lives in
-- src/competitions/lib/standings.ts; unsupported values are stored but
-- computeStandings throws LeagueConfigNotImplementedError(feature) when asked
-- to compute with them.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- comp_seasons
-- A season is independent of any specific league — multiple leagues can share
-- a season. Lifecycle: planned → active → completed → archived.
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_seasons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz,
  status          text NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned', 'active', 'completed', 'archived')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comp_seasons_status_idx
  ON public.comp_seasons (status, starts_at DESC);

CREATE TRIGGER comp_seasons_updated_at
  BEFORE UPDATE ON public.comp_seasons
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- comp_divisions
-- A division belongs to (season, league_name, tier). league_name is a text
-- field, not a FK — leagues are conceptual, identified by name reuse across
-- seasons. S24's promotion/relegation will use league_name to wire seasons
-- together.
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_divisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       uuid NOT NULL REFERENCES public.comp_seasons(id) ON DELETE CASCADE,
  league_name     text NOT NULL CHECK (char_length(league_name) BETWEEN 1 AND 80),
  tier            integer NOT NULL CHECK (tier BETWEEN 1 AND 10),
  tier_name       text NOT NULL CHECK (char_length(tier_name) BETWEEN 1 AND 40),
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (season_id, league_name, tier)
);

CREATE INDEX comp_divisions_season_idx
  ON public.comp_divisions (season_id);

-- ---------------------------------------------------------------------------
-- comp_fixtures
-- For 1v1 team nights: both entrants non-null. For multi-team galas (S24):
-- both null, participants live in comp_fixture_participants. S23 only supports
-- the 1v1 shape.
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_fixtures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  uuid NOT NULL REFERENCES public.comp_competitions(id) ON DELETE CASCADE,
  fixture_date    timestamptz NOT NULL,
  home_entrant_id uuid REFERENCES public.comp_competition_entrants(id) ON DELETE RESTRICT,
  away_entrant_id uuid REFERENCES public.comp_competition_entrants(id) ON DELETE RESTRICT,
  status          text NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled', 'in_progress', 'completed', 'postponed', 'cancelled')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT comp_fixtures_1v1_pair CHECK (
    (home_entrant_id IS NULL AND away_entrant_id IS NULL)
    OR
    (home_entrant_id IS NOT NULL AND away_entrant_id IS NOT NULL AND home_entrant_id <> away_entrant_id)
  )
);

CREATE INDEX comp_fixtures_competition_idx
  ON public.comp_fixtures (competition_id, fixture_date);

CREATE INDEX comp_fixtures_home_idx
  ON public.comp_fixtures (home_entrant_id)
  WHERE home_entrant_id IS NOT NULL;

CREATE INDEX comp_fixtures_away_idx
  ON public.comp_fixtures (away_entrant_id)
  WHERE away_entrant_id IS NOT NULL;

CREATE INDEX comp_fixtures_status_idx
  ON public.comp_fixtures (status);

CREATE TRIGGER comp_fixtures_updated_at
  BEFORE UPDATE ON public.comp_fixtures
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- comp_fixture_participants
-- Schema only in S23, no logic. Empty table. Documented but unused. Lets S24
-- land multi-team galas without another migration.
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_fixture_participants (
  fixture_id      uuid NOT NULL REFERENCES public.comp_fixtures(id) ON DELETE CASCADE,
  entrant_id      uuid NOT NULL REFERENCES public.comp_competition_entrants(id) ON DELETE RESTRICT,
  PRIMARY KEY (fixture_id, entrant_id)
);

-- ---------------------------------------------------------------------------
-- comp_match_lineups
-- Records which member played on which side of a team sub-match. Singles: one
-- row per side. Doubles: two rows per side.
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_match_lineups (
  match_id        uuid NOT NULL REFERENCES public.comp_matches(id) ON DELETE CASCADE,
  entrant_id      uuid NOT NULL REFERENCES public.comp_competition_entrants(id) ON DELETE CASCADE,
  member_id       uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  side            text NOT NULL CHECK (side IN ('a', 'b')),
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, side, member_id)
);

CREATE INDEX comp_match_lineups_match_idx
  ON public.comp_match_lineups (match_id);

CREATE INDEX comp_match_lineups_member_idx
  ON public.comp_match_lineups (member_id);

-- =============================================================================
-- Modifications to existing tables
-- =============================================================================

-- Tie matches to fixtures.
ALTER TABLE public.comp_matches
  ADD COLUMN fixture_id uuid REFERENCES public.comp_fixtures(id) ON DELETE CASCADE;

CREATE INDEX comp_matches_fixture_idx
  ON public.comp_matches (fixture_id)
  WHERE fixture_id IS NOT NULL;

-- Tie competitions to divisions and carry the versioned config.
ALTER TABLE public.comp_competitions
  ADD COLUMN division_id uuid REFERENCES public.comp_divisions(id) ON DELETE RESTRICT;

ALTER TABLE public.comp_competitions
  ADD COLUMN league_config jsonb;

-- Leagues require a division and a config.
ALTER TABLE public.comp_competitions
  ADD CONSTRAINT comp_competitions_league_requires_division
  CHECK (kind <> 'league' OR division_id IS NOT NULL);

ALTER TABLE public.comp_competitions
  ADD CONSTRAINT comp_competitions_league_requires_config
  CHECK (kind <> 'league' OR league_config IS NOT NULL);

CREATE INDEX comp_competitions_division_idx
  ON public.comp_competitions (division_id)
  WHERE division_id IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.comp_seasons                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_divisions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_fixtures               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_fixture_participants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_match_lineups          ENABLE ROW LEVEL SECURITY;

-- ---------- comp_seasons ----------
CREATE POLICY "comp_seasons select: authenticated"
  ON public.comp_seasons FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_seasons insert: owner"
  ON public.comp_seasons FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "comp_seasons update: owner"
  ON public.comp_seasons FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() = 'owner')
  WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "comp_seasons delete: owner"
  ON public.comp_seasons FOR DELETE
  TO authenticated
  USING (public.get_staff_role() = 'owner');

-- ---------- comp_divisions ----------
CREATE POLICY "comp_divisions select: authenticated"
  ON public.comp_divisions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_divisions insert: owner"
  ON public.comp_divisions FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "comp_divisions update: owner"
  ON public.comp_divisions FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() = 'owner')
  WITH CHECK (public.get_staff_role() = 'owner');

CREATE POLICY "comp_divisions delete: owner"
  ON public.comp_divisions FOR DELETE
  TO authenticated
  USING (public.get_staff_role() = 'owner');

-- ---------- comp_fixtures ----------
CREATE POLICY "comp_fixtures select: authenticated"
  ON public.comp_fixtures FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_fixtures insert: manager/owner"
  ON public.comp_fixtures FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_fixtures update: manager/owner"
  ON public.comp_fixtures FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_fixtures delete: manager/owner"
  ON public.comp_fixtures FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- comp_fixture_participants ----------
CREATE POLICY "comp_fixture_participants select: authenticated"
  ON public.comp_fixture_participants FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_fixture_participants insert: manager/owner"
  ON public.comp_fixture_participants FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_fixture_participants delete: manager/owner"
  ON public.comp_fixture_participants FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- comp_match_lineups ----------
CREATE POLICY "comp_match_lineups select: authenticated"
  ON public.comp_match_lineups FOR SELECT
  TO authenticated USING (true);

-- Manager/owner can manage any lineup.
CREATE POLICY "comp_match_lineups insert: manager/owner"
  ON public.comp_match_lineups FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_match_lineups delete: manager/owner"
  ON public.comp_match_lineups FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

-- Captain can set lineup for their team's side.
CREATE POLICY "comp_match_lineups insert: captain"
  ON public.comp_match_lineups FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.comp_matches m
      JOIN public.comp_competition_entrants e ON e.id = comp_match_lineups.entrant_id
      JOIN public.comp_teams t ON t.id = e.entrant_team_id
      WHERE m.id = comp_match_lineups.match_id
        AND t.captain_member_id = public.get_member_id()
    )
  );

-- Captain can clear lineup pre-play.
CREATE POLICY "comp_match_lineups delete: captain pre-play"
  ON public.comp_match_lineups FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.comp_matches m
      JOIN public.comp_competition_entrants e ON e.id = comp_match_lineups.entrant_id
      JOIN public.comp_teams t ON t.id = e.entrant_team_id
      WHERE m.id = comp_match_lineups.match_id
        AND m.status = 'scheduled'
        AND t.captain_member_id = public.get_member_id()
    )
  );

-- Captain can report sub-match result (extends S22's match-participant policy).
CREATE POLICY "comp_match_results insert: captain reports sub-match"
  ON public.comp_match_results FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.comp_matches m
      JOIN public.comp_competition_entrants e_a ON e_a.id = m.entrant_a_id
      JOIN public.comp_competition_entrants e_b ON e_b.id = m.entrant_b_id
      JOIN public.comp_teams t_a ON t_a.id = e_a.entrant_team_id
      JOIN public.comp_teams t_b ON t_b.id = e_b.entrant_team_id
      WHERE m.id = match_id
        AND m.status IN ('scheduled', 'in_progress')
        AND (
          t_a.captain_member_id = public.get_member_id()
          OR t_b.captain_member_id = public.get_member_id()
        )
    )
  );
