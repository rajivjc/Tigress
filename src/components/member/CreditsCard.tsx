import Link from "next/link";
import { formatMonthDay } from "@/lib/format";
import type { Member, MembershipTier } from "@/lib/types";

interface CreditsCardProps {
  member: Member;
  tier: MembershipTier | null;
}

export function CreditsCard({ member, tier }: CreditsCardProps) {
  const hasSubscription = member.subscription_status !== "none" && !!tier;

  if (!hasSubscription) {
    return (
      <section className="rounded-2xl border border-white/10 bg-surface/40 p-5 shadow-xl backdrop-blur">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">
          Credits
        </h3>
        <p className="mt-3 text-sm text-white/60">No active membership</p>
        <Link
          href="/book"
          className="mt-4 inline-flex items-center justify-center rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/5"
        >
          Explore plans
        </Link>
      </section>
    );
  }

  const total = tier.credits_per_month;
  const remaining = Math.max(0, member.credits_remaining);
  const pct = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-surface/60 p-5 shadow-xl backdrop-blur">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">
          Credits
        </h3>
        <div className="text-xs text-white/50">
          {member.credits_reset_date && (
            <>Resets {formatMonthDay(member.credits_reset_date)}</>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-white">{remaining}</span>
        <span className="text-sm text-white/50">/ {total} credits</span>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <Link
        href="/book"
        className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
      >
        Book a table
      </Link>
    </section>
  );
}
