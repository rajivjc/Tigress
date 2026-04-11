"use client";

// =============================================================================
// TierEditor
// =============================================================================
// Client-side editor list for membership tiers on the owner /settings page.
// Each tier renders as a read-only row until the owner taps Edit, at which
// point an inline form replaces the row. Saving posts to updateTierAction.
// Also provides an "Add tier" button at the bottom.
// =============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTierAction,
  updateTierAction,
} from "@/app/actions/settings";
import { formatSGDCents } from "@/lib/format";
import type { MembershipTier } from "@/lib/types";

export interface TierEditorProps {
  tiers: MembershipTier[];
}

export function TierEditor({ tiers }: TierEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      {tiers.map((tier) => (
        <div
          key={tier.id}
          className="rounded-xl border border-white/10 bg-surface-1/80 p-4"
        >
          {editingId === tier.id ? (
            <TierForm
              tier={tier}
              onCancel={() => setEditingId(null)}
              onSaved={() => setEditingId(null)}
            />
          ) : (
            <TierReadRow
              tier={tier}
              onEdit={() => setEditingId(tier.id)}
            />
          )}
        </div>
      ))}

      {adding ? (
        <div className="rounded-xl border border-white/10 bg-surface-1/80 p-4">
          <TierForm
            onCancel={() => setAdding(false)}
            onSaved={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border border-dashed border-white/15 py-3 text-xs font-medium text-white/60 hover:bg-white/5"
        >
          + Add tier
        </button>
      )}
    </div>
  );
}

function TierReadRow({
  tier,
  onEdit,
}: {
  tier: MembershipTier;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{tier.name}</p>
        <p className="mt-0.5 text-[11px] text-white/50">
          {formatSGDCents(tier.monthly_price_cents)} / month
        </p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <StatCell label="Credits" value={`${tier.credits_per_month}/mo`} />
          <StatCell
            label="Priority"
            value={`${tier.priority_booking_days}d`}
          />
          <StatCell
            label="Guest passes"
            value={`${tier.guest_passes_per_month}/mo`}
          />
        </dl>
        <p className="mt-2 truncate text-[10px] text-white/40">
          <span className="uppercase tracking-wider">Stripe: </span>
          <span className="font-mono text-white/60">
            {tier.stripe_price_id ?? "—"}
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 rounded-md border border-white/10 px-3 py-1 text-[11px] text-white/80 hover:bg-white/5"
      >
        Edit
      </button>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/5 bg-surface-2 p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className="text-white">{value}</div>
    </div>
  );
}

interface TierFormProps {
  tier?: MembershipTier;
  onCancel: () => void;
  onSaved: () => void;
}

function TierForm({ tier, onCancel, onSaved }: TierFormProps) {
  const router = useRouter();
  const [name, setName] = useState(tier?.name ?? "");
  const [priceDollars, setPriceDollars] = useState(
    tier ? (tier.monthly_price_cents / 100).toFixed(2) : ""
  );
  const [credits, setCredits] = useState(
    tier ? String(tier.credits_per_month) : ""
  );
  const [priorityDays, setPriorityDays] = useState(
    tier ? String(tier.priority_booking_days) : "3"
  );
  const [guestPasses, setGuestPasses] = useState(
    tier ? String(tier.guest_passes_per_month) : "0"
  );
  const [stripePriceId, setStripePriceId] = useState(
    tier?.stripe_price_id ?? ""
  );

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const priceCents = Math.round(parseFloat(priceDollars || "0") * 100);
    const trimmedPriceId = stripePriceId.trim();
    const payload = {
      name: name.trim(),
      monthly_price_cents: Number.isFinite(priceCents) ? priceCents : 0,
      credits_per_month: parseInt(credits || "0", 10),
      priority_booking_days: parseInt(priorityDays || "0", 10),
      guest_passes_per_month: parseInt(guestPasses || "0", 10),
      stripe_price_id: trimmedPriceId.length > 0 ? trimmedPriceId : null,
    };

    if (!payload.name) {
      setError("Name is required");
      return;
    }

    startTransition(async () => {
      const res = tier
        ? await updateTierAction(tier.id, payload)
        : await createTierAction(payload);
      if (!res.success) {
        setError(res.error ?? "Failed to save");
        return;
      }
      router.refresh();
      onSaved();
    });
  };

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <Field label="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </Field>

      <Field label="Monthly price (SGD)">
        <input
          type="number"
          step="0.01"
          min="0"
          value={priceDollars}
          onChange={(e) => setPriceDollars(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Credits">
          <input
            type="number"
            min="0"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-2 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </Field>
        <Field label="Priority days">
          <input
            type="number"
            min="0"
            value={priorityDays}
            onChange={(e) => setPriorityDays(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-2 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </Field>
        <Field label="Guest passes">
          <input
            type="number"
            min="0"
            value={guestPasses}
            onChange={(e) => setGuestPasses(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-2 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </Field>
      </div>

      <Field label="Stripe price ID (optional)">
        <input
          type="text"
          value={stripePriceId}
          onChange={(e) => setStripePriceId(e.target.value)}
          placeholder="price_xxx"
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 font-mono text-xs text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </Field>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="flex-1 rounded-md border border-white/15 px-3 py-2 text-xs text-white/70 hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </span>
      {children}
    </label>
  );
}
