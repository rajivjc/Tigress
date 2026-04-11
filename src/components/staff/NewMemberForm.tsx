"use client";

// =============================================================================
// NewMemberForm
// =============================================================================
// Owner-only form used to onboard existing club members who won't self-
// register. The owner sets the initial password, and may optionally assign
// a tier, starting credit balance, and subscription status up front.
// =============================================================================

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createMemberAction } from "@/app/actions/members";
import type { MembershipTier, SubscriptionStatus } from "@/lib/types";

const NO_TIER_VALUE = "__none__";

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "cancelled", label: "Cancelled" },
  { value: "none", label: "None" },
];

export interface NewMemberFormProps {
  tiers: MembershipTier[];
}

export function NewMemberForm({ tiers }: NewMemberFormProps) {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [tierId, setTierId] = useState<string>(NO_TIER_VALUE);
  const [credits, setCredits] = useState<string>("0");
  const [status, setStatus] = useState<SubscriptionStatus>("none");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Track whether the owner has manually edited credits / status so we don't
  // overwrite their explicit choices when the tier dropdown changes.
  const [creditsTouched, setCreditsTouched] = useState(false);
  const [statusTouched, setStatusTouched] = useState(false);

  const selectedTier = useMemo(() => {
    if (tierId === NO_TIER_VALUE) return null;
    return tiers.find((t) => t.id === tierId) ?? null;
  }, [tierId, tiers]);

  // Convenience: when a tier is picked, default credits + status to the tier's
  // monthly allowance + "active". The owner can still override either field.
  useEffect(() => {
    if (!creditsTouched) {
      setCredits(selectedTier ? String(selectedTier.credits_per_month) : "0");
    }
    if (!statusTouched) {
      setStatus(selectedTier ? "active" : "none");
    }
  }, [selectedTier, creditsTouched, statusTouched]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const parsedCredits = Number(credits);
    if (!Number.isFinite(parsedCredits) || parsedCredits < 0) {
      setError("Credits must be zero or greater");
      return;
    }

    startTransition(async () => {
      const res = await createMemberAction({
        full_name: fullName,
        email,
        phone: phone.trim() || undefined,
        password,
        membership_tier_id: tierId === NO_TIER_VALUE ? null : tierId,
        credits_remaining: Math.floor(parsedCredits),
        subscription_status: status,
        notes: notes.trim() || undefined,
      });

      if (!res.success || !res.memberId) {
        setError(res.error ?? "Failed to create member");
        return;
      }

      router.push(`/members/${res.memberId}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 p-4">
      <Link
        href="/members"
        className="inline-flex items-center text-xs text-white/60 hover:text-white"
      >
        ← All members
      </Link>

      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Membership
        </p>
        <h1 className="text-xl font-bold text-white">Add member</h1>
        <p className="mt-1 text-sm text-white/50">
          Create a new member account. The member can reset their password
          later using &ldquo;forgot password&rdquo;.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-white/10 bg-surface-1 p-4"
      >
        <Field label="Full name" htmlFor="full_name">
          <input
            id="full_name"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full rounded-lg border border-white/10 bg-surface-3 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </Field>

        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="w-full rounded-lg border border-white/10 bg-surface-3 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </Field>

        <Field label="Phone (optional)" htmlFor="phone">
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+65 9123 4567"
            className="w-full rounded-lg border border-white/10 bg-surface-3 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </Field>

        <Field label="Initial password" htmlFor="password">
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full rounded-lg border border-white/10 bg-surface-3 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </Field>

        <Field label="Membership tier (optional)" htmlFor="tier">
          <select
            id="tier"
            value={tierId}
            onChange={(e) => setTierId(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-surface-3 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          >
            <option value={NO_TIER_VALUE}>No tier</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Initial credits" htmlFor="credits">
          <input
            id="credits"
            type="number"
            min={0}
            step={1}
            value={credits}
            onChange={(e) => {
              setCreditsTouched(true);
              setCredits(e.target.value);
            }}
            className="w-full rounded-lg border border-white/10 bg-surface-3 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          {selectedTier && (
            <p className="mt-1 text-[11px] text-white/40">
              Tier allocation: {selectedTier.credits_per_month}/mo
            </p>
          )}
        </Field>

        <Field label="Subscription status" htmlFor="status">
          <select
            id="status"
            value={status}
            onChange={(e) => {
              setStatusTouched(true);
              setStatus(e.target.value as SubscriptionStatus);
            }}
            className="w-full rounded-lg border border-white/10 bg-surface-3 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes (optional)" htmlFor="notes">
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes about this member…"
            className="w-full rounded-lg border border-white/10 bg-surface-3 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </Field>

        {error && (
          <p
            className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
          >
            {pending ? "Creating…" : "Create member"}
          </button>
          <Link
            href="/members"
            className="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/5"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-[11px] uppercase tracking-wider text-white/50"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
