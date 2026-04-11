"use client";

// =============================================================================
// OwnerMembershipControls
// =============================================================================
// Owner-only controls on the staff member detail page for:
//   1. Assigning or clearing a membership tier
//   2. Overriding the credit balance (gifts, corrections, manual top-ups)
//   3. Manually setting the subscription status for members who aren't on
//      Stripe yet
//
// Each section has its own form + save button so the owner can update just
// the field they care about without having to round-trip the others.
// =============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  assignTierAction,
  setCreditsAction,
  setSubscriptionStatusAction,
} from "@/app/actions/members";
import { formatSGDCents } from "@/lib/format";
import type { MembershipTier, SubscriptionStatus } from "@/lib/types";

const NO_TIER_VALUE = "__none__";

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "cancelled", label: "Cancelled" },
  { value: "none", label: "None" },
];

export interface OwnerMembershipControlsProps {
  memberId: string;
  initialTierId: string | null;
  initialCredits: number;
  initialStatus: SubscriptionStatus;
  tiers: MembershipTier[];
}

export function OwnerMembershipControls({
  memberId,
  initialTierId,
  initialCredits,
  initialStatus,
  tiers,
}: OwnerMembershipControlsProps) {
  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-surface/60 p-4">
      <p className="text-[11px] uppercase tracking-wider text-white/40">
        Owner controls
      </p>
      <TierSection
        memberId={memberId}
        initialTierId={initialTierId}
        tiers={tiers}
      />
      <CreditSection
        memberId={memberId}
        initialCredits={initialCredits}
        initialTierId={initialTierId}
        tiers={tiers}
      />
      <StatusSection
        memberId={memberId}
        initialStatus={initialStatus}
      />
    </section>
  );
}

// -----------------------------------------------------------------------------
// Tier
// -----------------------------------------------------------------------------

function TierSection({
  memberId,
  initialTierId,
  tiers,
}: {
  memberId: string;
  initialTierId: string | null;
  tiers: MembershipTier[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(
    initialTierId ?? NO_TIER_VALUE
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const selectedTier = useMemo(() => {
    if (selected === NO_TIER_VALUE) return null;
    return tiers.find((t) => t.id === selected) ?? null;
  }, [selected, tiers]);

  const dirty = (initialTierId ?? NO_TIER_VALUE) !== selected;

  const handleSave = () => {
    setError(null);
    setSavedAt(null);
    const tierId = selected === NO_TIER_VALUE ? null : selected;
    startTransition(async () => {
      const res = await assignTierAction(memberId, tierId);
      if (!res.success) {
        setError(res.error ?? "Failed to assign tier");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-white/50">
        Membership tier
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-accent"
        >
          <option value={NO_TIER_VALUE}>No tier</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save tier"}
        </button>
      </div>

      {selectedTier ? (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <MiniStat
            label="Price / mo"
            value={formatSGDCents(selectedTier.monthly_price_cents)}
          />
          <MiniStat
            label="Credits / mo"
            value={selectedTier.credits_per_month}
          />
          <MiniStat
            label="Priority days"
            value={selectedTier.priority_booking_days}
          />
        </dl>
      ) : (
        <p className="mt-2 text-[11px] text-white/40">
          No tier — member cannot book until a tier is assigned.
        </p>
      )}

      {!initialTierId && selectedTier && (
        <p className="mt-2 text-[11px] text-white/50">
          Saving will auto-activate the subscription and grant{" "}
          {selectedTier.credits_per_month} credits if the balance is 0.
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
          {error}
        </p>
      )}
      {savedAt && !error && (
        <p className="mt-2 text-[11px] text-emerald-300/80">Tier saved.</p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Credits
// -----------------------------------------------------------------------------

function CreditSection({
  memberId,
  initialCredits,
  initialTierId,
  tiers,
}: {
  memberId: string;
  initialCredits: number;
  initialTierId: string | null;
  tiers: MembershipTier[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(String(initialCredits));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const tier = tiers.find((t) => t.id === initialTierId) ?? null;

  const parsed = Number(value);
  const validNumber = Number.isFinite(parsed) && parsed >= 0;
  const dirty = validNumber && Math.floor(parsed) !== initialCredits;

  const save = (credits: number) => {
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const res = await setCreditsAction(memberId, credits);
      if (!res.success) {
        setError(res.error ?? "Failed to save credits");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  };

  const handleSave = () => {
    if (!validNumber) {
      setError("Credits must be zero or greater");
      return;
    }
    save(Math.floor(parsed));
  };

  const handleResetToTier = () => {
    if (!tier) return;
    setValue(String(tier.credits_per_month));
    save(tier.credits_per_month);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/50">
            Credits remaining
          </p>
          <p className="text-2xl font-bold text-white">{initialCredits}</p>
        </div>
        {tier && (
          <p className="text-[11px] text-white/40">
            Tier allocation: {tier.credits_per_month}/mo
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save credits"}
        </button>
      </div>
      {tier && (
        <button
          type="button"
          onClick={handleResetToTier}
          disabled={pending}
          className="mt-2 rounded-md border border-white/20 px-3 py-1.5 text-[11px] font-medium text-white/80 hover:bg-white/5 disabled:opacity-40"
        >
          Reset to tier default ({tier.credits_per_month})
        </button>
      )}
      {error && (
        <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
          {error}
        </p>
      )}
      {savedAt && !error && (
        <p className="mt-2 text-[11px] text-emerald-300/80">Credits saved.</p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Subscription status
// -----------------------------------------------------------------------------

function StatusSection({
  memberId,
  initialStatus,
}: {
  memberId: string;
  initialStatus: SubscriptionStatus;
}) {
  const router = useRouter();
  const [value, setValue] = useState<SubscriptionStatus>(initialStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = value !== initialStatus;

  const handleSave = () => {
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const res = await setSubscriptionStatusAction(memberId, value);
      if (!res.success) {
        setError(res.error ?? "Failed to save status");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-white/50">
        Subscription status
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value as SubscriptionStatus)}
          className="flex-1 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-accent"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save status"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-white/40">
        Use this for members who aren&apos;t managed through Stripe yet.
      </p>
      {error && (
        <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
          {error}
        </p>
      )}
      {savedAt && !error && (
        <p className="mt-2 text-[11px] text-emerald-300/80">Status saved.</p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Small presentational helper
// -----------------------------------------------------------------------------

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/30 p-2">
      <p className="text-xs font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-white/40">
        {label}
      </p>
    </div>
  );
}
