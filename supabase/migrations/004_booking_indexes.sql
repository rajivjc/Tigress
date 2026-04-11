-- =============================================================================
-- 004_booking_indexes.sql — composite indexes for Phase 1 hot paths
-- =============================================================================
-- Adds the indexes that back the most frequent queries we issue from the
-- booking data layer (src/lib/data/bookings.ts) and the Stripe webhook
-- idempotency check (src/lib/stripe/webhooks.ts). All three are covering
-- enough that Postgres can serve the lookups without falling back to a
-- sequential scan on the bookings / audit_log tables.
-- =============================================================================

-- Composite index for slot availability queries (table + status + time range)
CREATE INDEX IF NOT EXISTS idx_bookings_table_status_time
  ON public.bookings (table_id, status, starts_at, ends_at);

-- Index for member booking overlap checks
CREATE INDEX IF NOT EXISTS idx_bookings_member_status_time
  ON public.bookings (member_id, status, starts_at, ends_at);

-- Index for webhook idempotency checks on audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_action_entity
  ON public.audit_log (action, entity_id);
