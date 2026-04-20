-- =============================================================================
-- Tigress — No-show tracking (Session 16)
-- =============================================================================
-- Adds a `no_show` flag on bookings so staff can mark members who didn't turn
-- up for a completed booking. Purely informational at this stage — no credit
-- penalties or booking blocks. The "only completed bookings can be marked" rule
-- is enforced in the application layer (see `markNoShow` / `unmarkNoShow`):
-- a CHECK constraint that referenced `status` would fight with the
-- auto-complete sweep's UPDATE ordering.
--
-- The bookings UPDATE policy added in migration 001 ("bookings update: own or
-- staff") already covers staff/manager/owner writes to this column, so no new
-- RLS policy is needed.
-- =============================================================================

ALTER TABLE public.bookings
  ADD COLUMN no_show boolean NOT NULL DEFAULT false;

-- Partial index keeps "count no-shows for member X" cheap without bloating the
-- general bookings_member_status index.
CREATE INDEX idx_bookings_member_no_show
  ON public.bookings (member_id, no_show)
  WHERE no_show = true;
