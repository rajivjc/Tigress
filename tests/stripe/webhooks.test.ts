import { describe, it, expect, beforeEach, vi } from "vitest";
import type Stripe from "stripe";
import {
  createFakeAdminClient,
  type FakeDb,
  type FakeMemberRow,
} from "../helpers/stripe-admin-mock";

// ---------------------------------------------------------------------------
// Module-level mutable state, shared between the vi.mock() factory and tests.
// ---------------------------------------------------------------------------
const db: FakeDb = {
  members: [],
  membership_tiers: [],
  audit_log: [],
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createFakeAdminClient(db),
}));

// Import under test AFTER vi.mock so the mocked admin client is used.
import {
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "@/lib/stripe/webhooks";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function resetDb(): void {
  db.members.length = 0;
  db.membership_tiers.length = 0;
  db.audit_log.length = 0;

  db.membership_tiers.push(
    { id: "tier-standard", credits_per_month: 4, stripe_price_id: "price_std" },
    { id: "tier-premium", credits_per_month: 10, stripe_price_id: "price_prem" }
  );

  db.members.push({
    id: "member-1",
    membership_tier_id: "tier-standard",
    credits_remaining: 0,
    credits_reset_date: null,
    subscription_status: "past_due",
    stripe_customer_id: "cus_abc",
  });
}

function makeInvoice(overrides: Partial<Stripe.Invoice> = {}): Stripe.Invoice {
  const periodEnd = Math.floor(Date.UTC(2026, 4, 11) / 1000);
  return {
    id: "in_test_001",
    customer: "cus_abc",
    attempt_count: 1,
    lines: {
      data: [{ period: { end: periodEnd, start: 0 } } as Stripe.InvoiceLineItem],
    } as Stripe.ApiList<Stripe.InvoiceLineItem>,
    ...overrides,
  } as Stripe.Invoice;
}

function makeSubscription(
  overrides: Partial<Stripe.Subscription> = {}
): Stripe.Subscription {
  return {
    id: "sub_test_001",
    customer: "cus_abc",
    status: "active",
    items: {
      data: [{ price: { id: "price_prem" } as Stripe.Price }],
    } as Stripe.ApiList<Stripe.SubscriptionItem>,
    ...overrides,
  } as Stripe.Subscription;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Stripe webhook handlers", () => {
  beforeEach(() => {
    resetDb();
  });

  // ===========================================================================
  // invoice.paid
  // ===========================================================================
  describe("handleInvoicePaid", () => {
    it("resets credits and marks subscription active", async () => {
      await handleInvoicePaid(makeInvoice());
      const m = db.members.find((r) => r.id === "member-1")!;
      expect(m.credits_remaining).toBe(4);
      expect(m.subscription_status).toBe("active");
      expect(m.credits_reset_date).toBe("2026-05-11");
    });

    it("writes an audit_log row with the invoice id", async () => {
      await handleInvoicePaid(makeInvoice());
      expect(db.audit_log.length).toBe(1);
      const entry = db.audit_log[0]!;
      expect(entry.action).toBe("credits.reset");
      expect(entry.entity_id).toBe("member-1");
      expect((entry.metadata as { invoice_id: string }).invoice_id).toBe(
        "in_test_001"
      );
    });

    it("is idempotent — skips when the audit log already contains the invoice", async () => {
      // Pre-seed the audit log as if we processed this invoice before.
      db.audit_log.push({
        actor_id: null,
        action: "credits.reset",
        entity_type: "member",
        entity_id: "member-1",
        metadata: { invoice_id: "in_test_001" },
      });

      const before = db.members[0]!.credits_remaining;
      await handleInvoicePaid(makeInvoice());
      // Credits should still be 0 (the seed value), NOT reset to 4.
      expect(db.members[0]!.credits_remaining).toBe(before);
      // No second audit row appended.
      expect(db.audit_log.length).toBe(1);
    });

    it("throws when no member is linked to the customer", async () => {
      db.members[0]!.stripe_customer_id = "cus_other";
      await expect(handleInvoicePaid(makeInvoice())).rejects.toThrow(
        /No member linked/
      );
    });

    it("uses 0 credits when the member has no tier", async () => {
      db.members[0]!.membership_tier_id = null;
      await handleInvoicePaid(makeInvoice());
      expect(db.members[0]!.credits_remaining).toBe(0);
    });
  });

  // ===========================================================================
  // invoice.payment_failed
  // ===========================================================================
  describe("handleInvoicePaymentFailed", () => {
    it("marks the subscription past_due", async () => {
      db.members[0]!.subscription_status = "active";
      await handleInvoicePaymentFailed(makeInvoice());
      expect(db.members[0]!.subscription_status).toBe("past_due");
    });

    it("writes an audit log entry", async () => {
      await handleInvoicePaymentFailed(makeInvoice({ attempt_count: 3 }));
      const entry = db.audit_log.find(
        (e) => e.action === "subscription.payment_failed"
      );
      expect(entry).toBeDefined();
      expect((entry!.metadata as { attempt_count: number }).attempt_count).toBe(
        3
      );
    });
  });

  // ===========================================================================
  // customer.subscription.deleted
  // ===========================================================================
  describe("handleSubscriptionDeleted", () => {
    it("zeros credits and sets status to cancelled", async () => {
      db.members[0]!.credits_remaining = 8;
      db.members[0]!.subscription_status = "active";
      await handleSubscriptionDeleted(makeSubscription());
      expect(db.members[0]!.credits_remaining).toBe(0);
      expect(db.members[0]!.subscription_status).toBe("cancelled");
    });

    it("writes an audit log entry", async () => {
      await handleSubscriptionDeleted(makeSubscription());
      expect(
        db.audit_log.some((e) => e.action === "subscription.cancelled")
      ).toBe(true);
    });
  });

  // ===========================================================================
  // customer.subscription.updated
  // ===========================================================================
  describe("handleSubscriptionUpdated", () => {
    it("swaps to the matching tier by stripe_price_id", async () => {
      db.members[0]!.membership_tier_id = "tier-standard";
      await handleSubscriptionUpdated(makeSubscription());
      expect(db.members[0]!.membership_tier_id).toBe("tier-premium");
    });

    it("sets status active for Stripe active", async () => {
      await handleSubscriptionUpdated(
        makeSubscription({ status: "active" as Stripe.Subscription.Status })
      );
      expect(db.members[0]!.subscription_status).toBe("active");
    });

    it("sets status past_due for Stripe past_due", async () => {
      await handleSubscriptionUpdated(
        makeSubscription({ status: "past_due" as Stripe.Subscription.Status })
      );
      expect(db.members[0]!.subscription_status).toBe("past_due");
    });

    it("sets status cancelled for Stripe canceled", async () => {
      await handleSubscriptionUpdated(
        makeSubscription({ status: "canceled" as Stripe.Subscription.Status })
      );
      expect(db.members[0]!.subscription_status).toBe("cancelled");
    });

    it("always writes an audit log entry with the new price id", async () => {
      await handleSubscriptionUpdated(makeSubscription());
      const entry = db.audit_log.find((e) => e.action === "subscription.updated");
      expect(entry).toBeDefined();
      expect(
        (entry!.metadata as { new_tier_id: string }).new_tier_id
      ).toBe("tier-premium");
    });
  });
});
