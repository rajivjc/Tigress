-- =============================================================================
-- Tigress — S24a fixup migration
-- =============================================================================
-- Two changes:
--
--   1. comp_fixtures.bye_entrant_id — records the team that's sitting out a
--      bye round. The schedule generator already knows which team is paired
--      with the phantom slot; this column lets the UI render the team name
--      instead of falling back to "TBD".
--
--   2. comp_set_fixture_participants(uuid, uuid[]) — atomic delete+insert
--      replacement for setParticipantsForFixture. Wrapped in plpgsql so the
--      two statements share a transaction; an insert failure rolls back the
--      delete, preventing the "fixture has zero participants" failure mode.
--
-- See src/competitions/lib/schedule.ts for the generator and
-- src/competitions/data/fixture-participants.ts for the RPC caller.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- bye_entrant_id column
-- ---------------------------------------------------------------------------
ALTER TABLE public.comp_fixtures
  ADD COLUMN bye_entrant_id uuid
  REFERENCES public.comp_competition_entrants(id) ON DELETE RESTRICT;

-- Bye fixtures must identify the team getting the bye; non-bye fixtures
-- must NOT have one set. NOT VALID so any pre-existing bye rows generated
-- in mock testing don't fail the migration — the existing
-- comp_fixtures_bye_has_no_teams CHECK still keeps home/away null on byes,
-- and new rows are validated immediately.
ALTER TABLE public.comp_fixtures
  ADD CONSTRAINT comp_fixtures_bye_entrant_consistent
  CHECK (
    (is_bye = false AND bye_entrant_id IS NULL)
    OR
    (is_bye = true AND bye_entrant_id IS NOT NULL)
  ) NOT VALID;

-- ---------------------------------------------------------------------------
-- comp_set_fixture_participants — atomic replace RPC
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: the caller's RLS context applies, so the existing write
-- policies on comp_fixture_participants (manager/owner only) gate the call.
CREATE OR REPLACE FUNCTION public.comp_set_fixture_participants(
  p_fixture_id uuid,
  p_entrant_ids uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM public.comp_fixture_participants
   WHERE fixture_id = p_fixture_id;

  IF array_length(p_entrant_ids, 1) IS NOT NULL THEN
    INSERT INTO public.comp_fixture_participants (fixture_id, entrant_id)
    SELECT p_fixture_id, unnest(p_entrant_ids);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.comp_set_fixture_participants(uuid, uuid[])
  TO authenticated;
