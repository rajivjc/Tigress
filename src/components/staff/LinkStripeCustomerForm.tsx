"use client";

// =============================================================================
// LinkStripeCustomerForm
// =============================================================================
// Owner-only inline input on the staff member detail page for setting /
// clearing a member's `stripe_customer_id`. The webhook handlers use this id
// to resolve incoming Stripe events back to a specific member row.
// =============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkStripeCustomerAction } from "@/app/actions/members";

export interface LinkStripeCustomerFormProps {
  memberId: string;
  initialCustomerId: string | null;
}

export function LinkStripeCustomerForm({
  memberId,
  initialCustomerId,
}: LinkStripeCustomerFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialCustomerId ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await linkStripeCustomerAction(memberId, value);
      if (!res.success) {
        setError(res.error ?? "Failed to save Stripe customer id");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <p className="text-[11px] uppercase tracking-wider text-white/40">
        Stripe customer id
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="cus_..."
          className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
          {error}
        </p>
      )}
      {savedAt && !error && (
        <p className="text-[11px] text-emerald-300/80">Saved.</p>
      )}
      <p className="text-[11px] text-white/40">
        Used by Stripe webhooks to reset credits and sync subscription status.
      </p>
    </form>
  );
}
