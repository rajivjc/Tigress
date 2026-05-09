-- =============================================================================
-- Tigress — S26 fix-ups (Session 27a)
-- =============================================================================
-- Folded into S27a so they ship in the same commit as the payroll engine:
--
-- 1. schedule_reverse_swap RPC — atomic shift_user + request status change.
--    Replaces the two-call pattern in reverseSwapAction that could leave
--    request flipped to 'reversed' but shift unchanged on partial failure
--    (S26 Critical 1).
--
-- 2. schedule_shift_change_requests SELECT policy tightening with
--    get_staff_role() envelope on the giveaway branch (S26 Critical 2).
--    Bare `kind = 'giveaway'` evaluated TRUE for any auth user, leaking
--    request rows to members.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- schedule_reverse_swap — atomic reversal of an accepted swap
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_reverse_swap(
  p_request_id uuid,
  p_reverser_staff_id uuid,
  p_note text
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  req public.schedule_shift_change_requests;
BEGIN
  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'Reversal note is required';
  END IF;

  SELECT * INTO req
    FROM public.schedule_shift_change_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap request % not found', p_request_id;
  END IF;
  IF req.status <> 'accepted' THEN
    RAISE EXCEPTION 'Only accepted swaps can be reversed (got %)', req.status;
  END IF;

  -- Restore the shift to the original requester.
  UPDATE public.schedule_shifts
     SET user_id = req.requested_by
   WHERE id = req.shift_id;

  -- Mark the request reversed with the audit note.
  UPDATE public.schedule_shift_change_requests
     SET status = 'reversed',
         reversal_note = p_note,
         resolved_at = now()
   WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_reverse_swap(uuid, uuid, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- schedule_shift_change_requests SELECT policy — envelope tightening
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "schedule_shift_change_requests select: marketplace + parties"
  ON public.schedule_shift_change_requests;

CREATE POLICY "schedule_shift_change_requests select: staff envelope + parties"
  ON public.schedule_shift_change_requests FOR SELECT
  TO authenticated
  USING (
    public.get_staff_role() IN ('manager', 'owner')
    OR (
      kind = 'giveaway'
      AND public.get_staff_role() IN ('staff', 'manager', 'owner')
    )
    OR (
      public.get_staff_role() IN ('staff', 'manager', 'owner')
      AND requested_by IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    )
    OR (
      public.get_staff_role() IN ('staff', 'manager', 'owner')
      AND target_user_id IN (SELECT id FROM public.staff WHERE auth_user_id = auth.uid())
    )
  );
