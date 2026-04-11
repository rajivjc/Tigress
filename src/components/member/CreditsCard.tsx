import Link from "next/link";
import { formatMonthDay } from "@/lib/format";
import type { Member, MembershipTier } from "@/lib/types";

interface CreditsCardProps {
  member: Member;
  tier: MembershipTier | null;
}

const RING_SIZE = 80;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function CreditsCard({ member, tier }: CreditsCardProps) {
  const hasSubscription = member.subscription_status !== "none" && !!tier;

  if (!hasSubscription) {
    return (
      <section className="rounded-2xl border border-white/10 bg-surface-1 p-5 shadow-xl">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">
          Credits
        </h3>
        <p className="mt-3 text-sm text-white/60">No active membership</p>
        <Link
          href="/book"
          className="mt-4 inline-flex items-center justify-center rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium text-white/70 transition-all duration-200 hover:bg-white/5 active:scale-[0.98]"
        >
          Explore plans
        </Link>
      </section>
    );
  }

  const total = tier.credits_per_month;
  const remaining = Math.max(0, member.credits_remaining);
  const ratio = total > 0 ? Math.min(1, remaining / total) : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - ratio);
  const isEmpty = remaining === 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-surface-1 p-5 shadow-xl">
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

      <div className="mt-4 flex flex-col items-center">
        <div
          className="relative"
          style={{ width: RING_SIZE, height: RING_SIZE }}
        >
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="-rotate-90"
          >
            <defs>
              <linearGradient
                id="credits-ring-gradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#E94560" stopOpacity="1" />
                <stop offset="100%" stopColor="#E94560" stopOpacity="0.6" />
              </linearGradient>
            </defs>
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={isEmpty ? "rgba(120, 50, 60, 0.35)" : "#222244"}
              strokeWidth={RING_STROKE}
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="url(#credits-ring-gradient)"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              style={{
                transition: "stroke-dashoffset 0.6s ease",
              }}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span
              className={`text-2xl font-bold ${
                isEmpty ? "text-white/40" : "text-white"
              }`}
            >
              {remaining}
            </span>
          </div>
        </div>
        <p
          className={`mt-2 text-xs ${
            isEmpty ? "text-white/40" : "text-white/50"
          }`}
        >
          {remaining} of {total} credits
        </p>
      </div>

      <Link
        href="/book"
        className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-accent/90 active:scale-[0.98]"
      >
        Book a table
      </Link>
    </section>
  );
}
