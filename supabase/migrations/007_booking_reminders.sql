-- =============================================================================
-- Tigress — Booking reminders (Session 17)
-- =============================================================================
-- Tracks whether a one-hour-ahead push reminder has been sent for each booking.
-- A Vercel Cron job (/api/cron/booking-reminders, every 15 min) looks for
-- confirmed member bookings starting in the next 45–75 minutes and NULL
-- reminder_sent_at, delivers the push, then stamps this column. The column
-- doubles as the idempotency key, so a duplicate cron run in the same window
-- cannot send a second reminder.
--
-- No index is needed: the cron query already filters on a narrow starts_at
-- range (covered by the composite booking indexes from migration 004) before
-- checking reminder_sent_at IS NULL.
-- =============================================================================

ALTER TABLE public.bookings
  ADD COLUMN reminder_sent_at timestamptz DEFAULT NULL;
