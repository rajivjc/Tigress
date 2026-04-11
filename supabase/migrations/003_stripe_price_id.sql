-- =============================================================================
-- Tigress — Migration 003: Add stripe_price_id to membership_tiers
-- =============================================================================
-- Adds stripe_price_id to membership_tiers so the subscription.updated webhook
-- can resolve which tier a member was changed to based on the Stripe price.
-- =============================================================================

ALTER TABLE public.membership_tiers
  ADD COLUMN IF NOT EXISTS stripe_price_id text UNIQUE;

COMMENT ON COLUMN public.membership_tiers.stripe_price_id IS
  'Stripe Price ID (e.g. price_xxx) used to map subscription changes to tiers';
