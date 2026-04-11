// =============================================================================
// Stripe webhook handlers
// =============================================================================
// Real event handlers for the subset of Stripe events we care about:
// subscription lifecycle + invoice payment results. Each handler resolves the
// member row by stripe_customer_id and applies the corresponding side-effect
// (credit reset, status change, etc.) using the Supabase service-role client.
//
// These functions assume `isSupabaseAdminConfigured()` has already been checked
// by the webhook route so we can safely call `createAdminClient()`.
// =============================================================================

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/** Error thrown when the invoice's customer can't be resolved to a member. */
class MemberNotFoundError extends Error {
  constructor(customerId: string | null) {
    super(`No member linked to Stripe customer ${customerId ?? "(null)"}`);
  }
}

interface MemberRow {
  id: string;
  membership_tier_id: string | null;
  credits_remaining: number;
}

async function findMemberByStripeCustomer(
  customerId: string | null
): Promise<MemberRow> {
  if (!customerId) {
    throw new MemberNotFoundError(customerId);
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, membership_tier_id, credits_remaining")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new MemberNotFoundError(customerId);
  return data as MemberRow;
}

async function writeAuditLog(
  action: string,
  memberId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("audit_log").insert({
    actor_id: null,
    action,
    entity_type: "member",
    entity_id: memberId,
    metadata,
  });
}

// ---------------------------------------------------------------------------
// invoice.paid
// ---------------------------------------------------------------------------
/**
 * A subscription invoice was paid → reset monthly credits and mark the
 * subscription active. The reset date comes from the invoice's current
 * billing period end so the next reset cycle matches Stripe's billing.
 */
export async function handleInvoicePaid(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId = extractCustomerId(invoice.customer);
  const member = await findMemberByStripeCustomer(customerId);

  const supabase = createAdminClient();

  // Idempotency guard: Stripe may deliver the same event multiple times.
  // We keyed past credit resets in the audit log with the invoice id, so
  // if we've already processed this invoice for this member, skip it.
  if (invoice.id) {
    const { data: existing } = await supabase
      .from("audit_log")
      .select("id")
      .eq("action", "credits.reset")
      .eq("entity_id", member.id)
      .filter("metadata->>invoice_id", "eq", invoice.id)
      .limit(1);
    if ((existing as { id: string }[] | null)?.length) {
      // Already processed — skip to avoid double-reset.
      return;
    }
  }

  // Look up the monthly credit allocation from the member's current tier.
  let creditsPerMonth = 0;
  if (member.membership_tier_id) {
    const { data: tierRow } = await supabase
      .from("membership_tiers")
      .select("credits_per_month")
      .eq("id", member.membership_tier_id)
      .maybeSingle();
    creditsPerMonth =
      (tierRow as { credits_per_month: number } | null)?.credits_per_month ??
      0;
  }

  // Pull the period end off the first line item — that's the next billing
  // date, which becomes the next credit reset date.
  const periodEnd = invoice.lines?.data?.[0]?.period?.end ?? null;
  const creditsResetDate = periodEnd
    ? new Date(periodEnd * 1000).toISOString().slice(0, 10)
    : null;

  const { error } = await supabase
    .from("members")
    .update({
      credits_remaining: creditsPerMonth,
      credits_reset_date: creditsResetDate,
      subscription_status: "active",
    })
    .eq("id", member.id);
  if (error) throw new Error(error.message);

  await writeAuditLog("credits.reset", member.id, {
    source: "stripe.invoice.paid",
    invoice_id: invoice.id,
    credits: creditsPerMonth,
    credits_reset_date: creditsResetDate,
  });
}

// ---------------------------------------------------------------------------
// invoice.payment_failed
// ---------------------------------------------------------------------------
export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId = extractCustomerId(invoice.customer);
  const member = await findMemberByStripeCustomer(customerId);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("members")
    .update({ subscription_status: "past_due" })
    .eq("id", member.id);
  if (error) throw new Error(error.message);

  await writeAuditLog("subscription.payment_failed", member.id, {
    source: "stripe.invoice.payment_failed",
    invoice_id: invoice.id,
    attempt_count: invoice.attempt_count,
  });
}

// ---------------------------------------------------------------------------
// customer.subscription.deleted
// ---------------------------------------------------------------------------
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId = extractCustomerId(subscription.customer);
  const member = await findMemberByStripeCustomer(customerId);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("members")
    .update({
      subscription_status: "cancelled",
      credits_remaining: 0,
    })
    .eq("id", member.id);
  if (error) throw new Error(error.message);

  await writeAuditLog("subscription.cancelled", member.id, {
    source: "stripe.customer.subscription.deleted",
    subscription_id: subscription.id,
  });
}

// ---------------------------------------------------------------------------
// customer.subscription.updated
// ---------------------------------------------------------------------------
/**
 * Handle a Stripe subscription update — most often a tier change. We look up
 * the member row that matches the subscription's price metadata (if present)
 * and swap membership_tier_id so future credit resets pick up the new
 * allocation. Credits are left alone on purpose: they'll refresh naturally on
 * the next invoice.paid event.
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId = extractCustomerId(subscription.customer);
  const member = await findMemberByStripeCustomer(customerId);

  // Attempt to resolve the new tier via `stripe_price_id` metadata on the
  // membership_tiers table. If the deployment doesn't have that column yet,
  // we just log the event and move on without touching the tier.
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;

  const supabase = createAdminClient();

  let newTierId: string | null = null;
  if (priceId) {
    const { data: tierRow } = await supabase
      .from("membership_tiers")
      .select("id")
      .eq("stripe_price_id", priceId)
      .maybeSingle();
    newTierId = (tierRow as { id: string } | null)?.id ?? null;
  }

  const updatePayload: Record<string, unknown> = {};
  if (newTierId && newTierId !== member.membership_tier_id) {
    updatePayload.membership_tier_id = newTierId;
  }
  // Normalise Stripe statuses we care about to our own.
  if (subscription.status === "active") {
    updatePayload.subscription_status = "active";
  } else if (subscription.status === "past_due") {
    updatePayload.subscription_status = "past_due";
  } else if (
    subscription.status === "canceled" ||
    subscription.status === "incomplete_expired"
  ) {
    updatePayload.subscription_status = "cancelled";
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error } = await supabase
      .from("members")
      .update(updatePayload)
      .eq("id", member.id);
    if (error) throw new Error(error.message);
  }

  await writeAuditLog("subscription.updated", member.id, {
    source: "stripe.customer.subscription.updated",
    subscription_id: subscription.id,
    stripe_status: subscription.status,
    new_tier_id: newTierId,
    previous_tier_id: member.membership_tier_id,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id;
}
