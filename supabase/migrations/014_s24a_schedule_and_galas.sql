-- =============================================================================
-- Tigress — Schedule generation & multi-team galas (Session 24a)
-- =============================================================================
-- Adds the schema needed by the Berger-table round-robin generator and the
-- multi-team gala feature. All new persistence is additive — existing rows
-- pick up safe defaults and the standings engine continues to operate on
-- 2-team result rows after a normalisation pre-pass.
--
-- See src/competitions/lib/schedule.ts for the pure generator and
-- src/competitions/data/fixture-pairings.ts for the gala internals layer.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- comp_fixtures additions
-- ---------------------------------------------------------------------------
ALTER TABLE public.comp_fixtures
  ADD COLUMN round_number  integer,
  ADD COLUMN is_bye        boolean NOT NULL DEFAULT false,
  ADD COLUMN pairing_mode  text    NOT NULL DEFAULT 'two_team';

ALTER TABLE public.comp_fixtures
  ADD CONSTRAINT comp_fixtures_pairing_mode_check
  CHECK (pairing_mode IN ('two_team', 'gala_round_robin', 'gala_manual'));

-- Bye fixtures must not carry team columns. The 1v1 pairing CHECK already
-- exists from migration 013; this constraint is the bye-specific add.
ALTER TABLE public.comp_fixtures
  ADD CONSTRAINT comp_fixtures_bye_has_no_teams
  CHECK ((is_bye = false)
         OR (home_entrant_id IS NULL AND away_entrant_id IS NULL));

-- 2-team fixtures must use the home/away columns (or be a bye). Gala fixtures
-- must NOT use the home/away columns — their participants live in
-- comp_fixture_participants and pairings in comp_fixture_pairings.
ALTER TABLE public.comp_fixtures
  ADD CONSTRAINT comp_fixtures_pairing_mode_columns
  CHECK (
    (pairing_mode = 'two_team' AND (is_bye = true OR (home_entrant_id IS NOT NULL AND away_entrant_id IS NOT NULL)))
    OR
    (pairing_mode IN ('gala_round_robin', 'gala_manual') AND home_entrant_id IS NULL AND away_entrant_id IS NULL AND is_bye = false)
  );

CREATE INDEX comp_fixtures_round_idx
  ON public.comp_fixtures (competition_id, round_number)
  WHERE round_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- comp_fixture_pairings — pairwise matchups inside a gala
-- ---------------------------------------------------------------------------
CREATE TABLE public.comp_fixture_pairings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id      uuid NOT NULL REFERENCES public.comp_fixtures(id) ON DELETE CASCADE,
  home_team_id    uuid NOT NULL REFERENCES public.comp_teams(id) ON DELETE RESTRICT,
  away_team_id    uuid NOT NULL REFERENCES public.comp_teams(id) ON DELETE RESTRICT,
  pairing_order   integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT comp_fixture_pairings_distinct_teams
    CHECK (home_team_id <> away_team_id),
  CONSTRAINT comp_fixture_pairings_unique_pair_per_fixture
    UNIQUE (fixture_id, home_team_id, away_team_id)
);

CREATE INDEX comp_fixture_pairings_fixture_idx
  ON public.comp_fixture_pairings (fixture_id);

-- ---------------------------------------------------------------------------
-- comp_matches — link sub-matches to a gala pairing
-- ---------------------------------------------------------------------------
ALTER TABLE public.comp_matches
  ADD COLUMN pairing_id uuid REFERENCES public.comp_fixture_pairings(id) ON DELETE CASCADE;

CREATE INDEX comp_matches_pairing_idx
  ON public.comp_matches (pairing_id)
  WHERE pairing_id IS NOT NULL;

-- A pairing-scoped sub-match must belong to the same fixture as its pairing.
-- Enforced via trigger because CHECK can't read across rows.
CREATE OR REPLACE FUNCTION public.comp_matches_pairing_fixture_check()
RETURNS trigger AS $$
DECLARE
  pairing_fixture uuid;
BEGIN
  IF NEW.pairing_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT fixture_id INTO pairing_fixture
    FROM public.comp_fixture_pairings
    WHERE id = NEW.pairing_id;
  IF pairing_fixture IS NULL THEN
    RAISE EXCEPTION 'pairing_id % does not exist', NEW.pairing_id;
  END IF;
  IF NEW.fixture_id IS NULL OR NEW.fixture_id <> pairing_fixture THEN
    RAISE EXCEPTION 'pairing_id % belongs to a different fixture (% vs %)',
      NEW.pairing_id, pairing_fixture, NEW.fixture_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comp_matches_pairing_fixture_trigger
  BEFORE INSERT OR UPDATE OF pairing_id, fixture_id
  ON public.comp_matches
  FOR EACH ROW EXECUTE FUNCTION public.comp_matches_pairing_fixture_check();

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.comp_fixture_pairings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_fixture_pairings select: authenticated"
  ON public.comp_fixture_pairings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_fixture_pairings insert: manager/owner"
  ON public.comp_fixture_pairings FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_fixture_pairings update: manager/owner"
  ON public.comp_fixture_pairings FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "comp_fixture_pairings delete: manager/owner"
  ON public.comp_fixture_pairings FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));
