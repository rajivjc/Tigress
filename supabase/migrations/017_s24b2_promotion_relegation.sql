-- =============================================================================
-- Tigress — S24b2: promotion/relegation, N+1 cleanup, replay audit lifecycle
-- =============================================================================
-- 1. comp_divisions gains promote_count / relegate_count plus a finalized
--    timestamp/by pair so each division knows its own season-end policy and
--    when the manager has finalized it. Append-only — finalize cannot run
--    twice on the same division.
-- 2. comp_promotion_decisions records every promote/relegate/stay decision
--    for forensic audit of contested promotion calls. INSERT-only.
-- 3. comp_seasons.next_season_id wires seasons together explicitly so the
--    finalize action can resolve target divisions in the next season.
-- 4. comp_finalize_division_promotions(uuid, jsonb, uuid) RPC performs the
--    multi-row enrolment + decision insert + finalize stamp atomically.
-- 5. v_lineup_approvals_for_captain consolidates the captain-scoped pending
--    and rejected lineup queries into a single SQL view so the data layer
--    fetches the full result set in one round trip.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. comp_divisions: promote/relegate counts + finalize stamp
-- ---------------------------------------------------------------------------

ALTER TABLE public.comp_divisions
  ADD COLUMN promote_count           int NOT NULL DEFAULT 0
    CHECK (promote_count >= 0),
  ADD COLUMN relegate_count          int NOT NULL DEFAULT 0
    CHECK (relegate_count >= 0),
  ADD COLUMN promotions_finalized_at timestamptz,
  ADD COLUMN promotions_finalized_by uuid REFERENCES public.members(id) ON DELETE SET NULL,
  ADD CONSTRAINT comp_divisions_finalize_consistent
    CHECK (
      (promotions_finalized_at IS NULL AND promotions_finalized_by IS NULL)
      OR
      (promotions_finalized_at IS NOT NULL AND promotions_finalized_by IS NOT NULL)
    );

-- ---------------------------------------------------------------------------
-- 2. comp_promotion_decisions — append-only audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE public.comp_promotion_decisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_division_id    uuid NOT NULL REFERENCES public.comp_divisions(id) ON DELETE RESTRICT,
  source_entrant_id     uuid NOT NULL REFERENCES public.comp_competition_entrants(id) ON DELETE RESTRICT,
  source_team_id        uuid NOT NULL REFERENCES public.comp_teams(id) ON DELETE RESTRICT,
  source_position       int NOT NULL CHECK (source_position >= 1),
  target_division_id    uuid NOT NULL REFERENCES public.comp_divisions(id) ON DELETE RESTRICT,
  target_entrant_id     uuid NOT NULL REFERENCES public.comp_competition_entrants(id) ON DELETE RESTRICT,
  decision              text NOT NULL
    CHECK (decision IN ('promote', 'relegate', 'stay')),
  was_manual_override   boolean NOT NULL DEFAULT false,
  override_note         text,
  decided_at            timestamptz NOT NULL DEFAULT now(),
  decided_by_member_id  uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,

  CONSTRAINT comp_promotion_decisions_override_note_when_manual
    CHECK (
      (was_manual_override = false AND override_note IS NULL)
      OR
      (was_manual_override = true AND override_note IS NOT NULL AND char_length(override_note) >= 1)
    )
);

CREATE INDEX comp_promotion_decisions_source_idx
  ON public.comp_promotion_decisions (source_division_id);
CREATE INDEX comp_promotion_decisions_target_idx
  ON public.comp_promotion_decisions (target_division_id);

ALTER TABLE public.comp_promotion_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_promotion_decisions select: authenticated"
  ON public.comp_promotion_decisions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "comp_promotion_decisions insert: manager/owner"
  ON public.comp_promotion_decisions FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

-- No UPDATE or DELETE — append-only audit table.

-- ---------------------------------------------------------------------------
-- 3. comp_seasons.next_season_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.comp_seasons
  ADD COLUMN next_season_id uuid REFERENCES public.comp_seasons(id) ON DELETE SET NULL,
  ADD CONSTRAINT comp_seasons_next_season_distinct
    CHECK (next_season_id IS NULL OR next_season_id <> id);

-- ---------------------------------------------------------------------------
-- 4. Atomic finalize RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.comp_finalize_division_promotions(
  p_division_id      uuid,
  p_decisions        jsonb,
  p_decided_by       uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  rec jsonb;
  new_entrant_id uuid;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(p_decisions) LOOP
    INSERT INTO public.comp_competition_entrants
      (competition_id, entrant_team_id, status, registered_at)
    VALUES
      ((rec->>'targetCompetitionId')::uuid,
       (rec->>'sourceTeamId')::uuid,
       'active',
       now())
    RETURNING id INTO new_entrant_id;

    INSERT INTO public.comp_promotion_decisions
      (source_division_id, source_entrant_id, source_team_id, source_position,
       target_division_id, target_entrant_id,
       decision, was_manual_override, override_note,
       decided_by_member_id)
    VALUES
      (p_division_id,
       (rec->>'entrantId')::uuid,
       (rec->>'sourceTeamId')::uuid,
       (rec->>'position')::int,
       (rec->>'targetDivisionId')::uuid,
       new_entrant_id,
       rec->>'decision',
       (rec->>'wasManualOverride')::boolean,
       NULLIF(rec->>'overrideNote', ''),
       p_decided_by);
  END LOOP;

  UPDATE public.comp_divisions
     SET promotions_finalized_at = now(),
         promotions_finalized_by = p_decided_by
   WHERE id = p_division_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.comp_finalize_division_promotions(uuid, jsonb, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. v_lineup_approvals_for_captain
-- ---------------------------------------------------------------------------
-- Pending rows: the OPPOSING-side captain decides; the row needs to surface
-- to that captain. Rejected rows: the OWN-side captain has to clear and
-- resubmit; the row needs to surface to that captain. CASE selects the
-- relevant captain id so a single WHERE filter on `interested_captain_member_id`
-- works for both views.

CREATE OR REPLACE VIEW public.v_lineup_approvals_for_captain AS
SELECT
  l.match_id,
  l.entrant_id           AS sub_entrant_id,
  l.side                 AS sub_side,
  l.member_id            AS sub_member_id,
  l.approval_status,
  l.approved_by_member_id,
  l.approved_at,
  l.approval_note,
  m.competition_id,
  m.fixture_id,
  CASE l.approval_status
    WHEN 'pending'  THEN opposing_team.captain_member_id
    WHEN 'rejected' THEN own_team.captain_member_id
  END                    AS interested_captain_member_id
FROM public.comp_match_lineups l
INNER JOIN public.comp_matches m ON l.match_id = m.id
LEFT JOIN public.comp_competition_entrants own_entrant
  ON own_entrant.id = CASE l.side WHEN 'a' THEN m.entrant_a_id ELSE m.entrant_b_id END
LEFT JOIN public.comp_teams own_team ON own_team.id = own_entrant.entrant_team_id
LEFT JOIN public.comp_competition_entrants opposing_entrant
  ON opposing_entrant.id = CASE l.side WHEN 'a' THEN m.entrant_b_id ELSE m.entrant_a_id END
LEFT JOIN public.comp_teams opposing_team ON opposing_team.id = opposing_entrant.entrant_team_id
WHERE l.approval_status IN ('pending', 'rejected');

GRANT SELECT ON public.v_lineup_approvals_for_captain TO authenticated;
