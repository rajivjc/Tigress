// =============================================================================
// POST /api/webhooks/stripe
// =============================================================================
// Receives Stripe webhook events, verifies the signature against the raw
// request body, and dispatches to the handler functions in
// `src/lib/stripe/webhooks.ts`. In mock mode (Supabase admin not configured)
// this returns 200 with a no-op message so Stripe's dashboard test event
// doesn't keep reporting failures — useful while the integration is still
// being set up.
// =============================================================================

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "@/lib/stripe/webhooks";

// Stripe requires the raw, unparsed request body for signature verification,
// so we explicitly opt out of the App Router's default body parsing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Mock mode: nothing to persist, so just ack.
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({
      received: true,
      mock: true,
      message:
        "Stripe webhook received in mock mode — Supabase admin client not configured.",
    });
  }

  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const apiKey = process.env.STRIPE_SECRET_KEY;

  if (!signature || !secret || !apiKey) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured" },
      { status: 500 }
    );
  }

  // Read the raw body — required for constructEvent signature verification.
  const rawBody = await request.text();

  // Omit apiVersion so the SDK falls back to whatever version it was
  // compiled against — this keeps the route working across Stripe package
  // upgrades without a manual version bump.
  const stripe = new Stripe(apiKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Signature verification failed";
    return NextResponse.json(
      { error: `Invalid signature: ${message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription
        );
        break;
      default:
        // Not one we handle; still ack so Stripe stops retrying.
        break;
    }
  } catch (err) {
    // Surface a 500 so Stripe retries — but log enough context to diagnose.
    const message =
      err instanceof Error ? err.message : "Webhook handler failed";
    console.error(`[stripe webhook] ${event.type} failed:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
