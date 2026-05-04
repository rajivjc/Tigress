-- =============================================================================
-- Tigress — S24b1: lineup approval workflow
-- =============================================================================
-- Adds substitution-approval columns to comp_match_lineups so the
-- `sub_with_approval` lineup rule (introduced in S24b1) can stage non-roster
-- players in a "pending" state until the opposing captain (or a manager
-- override) approves them. Existing rows back-fill to `not_required` from the
-- column DEFAULT, which matches the strict-mode behaviour they were created
-- under.
-- =============================================================================

ALTER TABLE public.comp_match_lineups
  ADD COLUMN approval_status text NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected')),
  ADD COLUMN approved_by_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approval_note text;

-- Approval columns must be self-consistent: any decision (approved /
-- rejected) MUST carry both the approver and a timestamp; the not_required /
-- pending states MUST NOT.
ALTER TABLE public.comp_match_lineups
  ADD CONSTRAINT comp_match_lineups_approval_consistent
  CHECK (
    (approval_status = 'not_required' AND approved_by_member_id IS NULL AND approved_at IS NULL)
    OR
    (approval_status = 'pending' AND approved_by_member_id IS NULL AND approved_at IS NULL)
    OR
    (approval_status IN ('approved', 'rejected') AND approved_by_member_id IS NOT NULL AND approved_at IS NOT NULL)
  );

-- Helps the captain-facing PendingApprovalsList query: "give me every pending
-- row for any of my opponent matches" — partial index keeps the lookup cheap
-- once historical rows pile up.
CREATE INDEX comp_match_lineups_pending_idx
  ON public.comp_match_lineups (match_id)
  WHERE approval_status = 'pending';
