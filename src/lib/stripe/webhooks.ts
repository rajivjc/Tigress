import { NextResponse } from "next/server";

/**
 * Stripe webhook handler stub.
 * Will be wired up once Stripe is connected.
 */
export async function handleStripeWebhook(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json(
      { error: "Missing signature or webhook secret" },
      { status: 400 }
    );
  }

  // TODO: verify signature and dispatch events once Stripe is wired up.
  return NextResponse.json({ received: true });
}
