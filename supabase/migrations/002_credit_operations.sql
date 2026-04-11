-- =============================================================================
-- Tigress — Migration 002: Credit operations
-- =============================================================================
-- Adds atomic RPC functions for refunding and deducting member booking credits.
-- The original read-then-update pattern in cancelBooking could double-refund
-- under concurrent requests, and a similar pattern for deduction could let a
-- member overspend their balance. Both are fixed here by doing the arithmetic
-- inside a single SQL statement (refund_credits) or a SELECT ... FOR UPDATE
-- row lock (deduct_credits).
-- =============================================================================

-- ---------- refund_credits --------------------------------------------------
-- Atomically adds p_credits to the given member's balance. Uses a single
-- UPDATE so there is no read-modify-write window for another transaction to
-- sneak in between.
CREATE OR REPLACE FUNCTION public.refund_credits(
  p_member_id uuid,
  p_credits   integer
)
RETURNS void AS $$
BEGIN
  UPDATE public.members
  SET credits_remaining = credits_remaining + p_credits
  WHERE id = p_member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------- deduct_credits --------------------------------------------------
-- Atomically deducts p_credits from the member's balance, provided there are
-- enough credits remaining. Returns true on success, false if the member has
-- insufficient credits (or does not exist). The SELECT ... FOR UPDATE row
-- lock guarantees two concurrent bookings cannot both debit the same balance.
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_member_id uuid,
  p_credits   integer
)
RETURNS boolean AS $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT credits_remaining INTO v_remaining
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;

  IF v_remaining IS NULL OR v_remaining < p_credits THEN
    RETURN false;
  END IF;

  UPDATE public.members
  SET credits_remaining = credits_remaining - p_credits
  WHERE id = p_member_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow authenticated users to call these RPCs. The RLS on members still
-- applies to direct SELECT/UPDATE, but SECURITY DEFINER lets the functions
-- update the member row on behalf of the caller.
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer) TO authenticated;
