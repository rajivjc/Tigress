-- =============================================================================
-- Tigress — Single-elim tournaments (Session 22)
-- =============================================================================
-- Builds on migration 011 (competitions foundation). Adds only what's strictly
-- new for the first playable format:
--
--   * `comp_matches.is_walkover` flag for byes / withdrawals / no-shows.
--   * Nullable entrant columns so round 2+ matches can sit half-populated
--     until their feeder matches complete. A matching CHECK requires both
--     entrants as soon as a match goes in_progress or completed.
--   * New RLS policies: members can self-register/withdraw during
--     registration_open, and a match participant can insert the result row
--     (the winner-must-report rule is layered on in application code).
-- =============================================================================

-- ---------- comp_matches: is_walkover flag ----------
ALTER TABLE public.comp_matches
  ADD COLUMN is_walkover boolean NOT NULL DEFAULT false;

-- ---------- comp_matches: relax entrant NOT NULLs ----------
-- Persisting a full bracket at publish time means rounds 2..R have TBD
-- slots that only get filled as feeders resolve. We can't leave the NOT NULL
-- constraint in place, but we also can't allow a match to be played without
-- two known players — so CHECK that both columns are non-null whenever the
-- match is in_progress or completed (or forfeited/disputed).
ALTER TABLE public.comp_matches ALTER COLUMN entrant_a_id DROP NOT NULL;
ALTER TABLE public.comp_matches ALTER COLUMN entrant_b_id DROP NOT NULL;

ALTER TABLE public.comp_matches
  ADD CONSTRAINT comp_matches_entrants_when_active CHECK (
    status = 'scheduled'
    OR (entrant_a_id IS NOT NULL AND entrant_b_id IS NOT NULL)
  );

-- The original comp_matches_distinct_entrants constraint (from 011) still
-- fires when both columns are non-null; it's unchanged by this migration.

-- =============================================================================
-- RLS: member-facing paths
-- =============================================================================
-- S21 shipped manager/owner-only writes. These policies open the narrow
-- window member flows need:
--   * self-register as an entrant on an individual tournament whose status
--     is registration_open
--   * withdraw (status = 'withdrawn') from an own entrant row
--   * insert a match result row for a match the caller is playing in
-- =============================================================================

-- Members self-register for individual tournaments while registration is open.
CREATE POLICY "comp_entrants insert: member self-register"
  ON public.comp_competition_entrants FOR INSERT
  TO authenticated
  WITH CHECK (
    entrant_member_id IS NOT NULL
    AND entrant_member_id = public.get_member_id()
    AND EXISTS (
      SELECT 1 FROM public.comp_competitions c
      WHERE c.id = competition_id
        AND c.status = 'registration_open'
        AND c.entrant_type = 'individual'
    )
  );

-- Members flip their own entrant to withdrawn.
CREATE POLICY "comp_entrants update: own withdrawal"
  ON public.comp_competition_entrants FOR UPDATE
  TO authenticated
  USING (
    entrant_member_id IS NOT NULL
    AND entrant_member_id = public.get_member_id()
  )
  WITH CHECK (
    entrant_member_id = public.get_member_id()
    AND status = 'withdrawn'
  );

-- Members can delete their own entrant row before the bracket exists (used
-- by the withdraw flow while registration is still open — no audit trail
-- needed since it's pre-bracket).
CREATE POLICY "comp_entrants delete: own pre-bracket"
  ON public.comp_competition_entrants FOR DELETE
  TO authenticated
  USING (
    entrant_member_id IS NOT NULL
    AND entrant_member_id = public.get_member_id()
    AND EXISTS (
      SELECT 1 FROM public.comp_competitions c
      WHERE c.id = competition_id
        AND c.status = 'registration_open'
    )
  );

-- Members who are an entrant on a match can record its result.
-- The winner-must-report rule is enforced in the server action, not SQL.
CREATE POLICY "comp_match_results insert: match participant"
  ON public.comp_match_results FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.comp_matches m
      LEFT JOIN public.comp_competition_entrants e_a ON e_a.id = m.entrant_a_id
      LEFT JOIN public.comp_competition_entrants e_b ON e_b.id = m.entrant_b_id
      WHERE m.id = match_id
        AND m.status IN ('scheduled', 'in_progress')
        AND (
          e_a.entrant_member_id = public.get_member_id()
          OR e_b.entrant_member_id = public.get_member_id()
        )
    )
  );
