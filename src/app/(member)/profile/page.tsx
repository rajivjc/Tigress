import { redirect } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { StatusDot } from "@/components/ui/StatusDot";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { EditProfileForm } from "@/components/member/EditProfileForm";
import { BookingHistoryList } from "@/components/member/BookingHistoryList";
import { getCurrentAuthUserId, getMemberWithTier } from "@/lib/data/members";
import { getPastBookings } from "@/lib/data/bookings";
import { formatMonthDay } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) redirect("/login");

  const profile = await getMemberWithTier(authUserId);
  if (!profile) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-white/10 bg-surface/60 p-6 text-center">
          <h1 className="text-lg font-semibold text-white">
            No member profile
          </h1>
          <p className="mt-2 text-sm text-white/60">
            This account is signed in but has no linked member record.
          </p>
          <div className="mt-4">
            <LogoutButton />
          </div>
        </div>
      </div>
    );
  }

  const { member, tier } = profile;
  const history = await getPastBookings(member.id, 10);

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <section className="rounded-2xl border border-white/10 bg-surface/60 p-5 shadow-xl backdrop-blur">
        <div className="flex items-start gap-4">
          <Avatar name={member.full_name} src={member.avatar_url} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-white">
              {member.full_name}
            </h1>
            <p className="truncate text-xs text-white/60">{member.email}</p>
            {member.phone && (
              <p className="truncate text-xs text-white/50">{member.phone}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
                {tier?.name ?? "No tier"}
              </span>
              <StatusDot status={member.subscription_status} />
            </div>
          </div>
        </div>
      </section>

      {/* Edit */}
      <section className="rounded-2xl border border-white/10 bg-surface/60 p-5 shadow-xl backdrop-blur">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">
          Edit profile
        </h2>
        <EditProfileForm member={member} />
      </section>

      {/* Membership details */}
      <section className="rounded-2xl border border-white/10 bg-surface/60 p-5 shadow-xl backdrop-blur">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">
          Membership
        </h2>
        {tier ? (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div className="text-lg font-semibold text-white">
                {tier.name}
              </div>
              <div className="text-xs text-white/50">
                ${(tier.monthly_price_cents / 100).toFixed(0)} / mo
              </div>
            </div>

            {Array.isArray(tier.perks) && tier.perks.length > 0 && (
              <ul className="space-y-1.5 text-xs text-white/70">
                {(tier.perks as string[]).map((perk) => (
                  <li
                    key={perk}
                    className="flex items-start gap-2 before:mt-[6px] before:inline-block before:h-1 before:w-1 before:shrink-0 before:rounded-full before:bg-accent"
                  >
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 p-3 text-xs">
              <span className="text-white/60">Credits remaining</span>
              <span className="font-semibold text-white">
                {member.credits_remaining} / {tier.credits_per_month}
              </span>
            </div>
            {member.credits_reset_date && (
              <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 p-3 text-xs">
                <span className="text-white/60">Resets</span>
                <span className="font-semibold text-white">
                  {formatMonthDay(member.credits_reset_date)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-white/60">
            No membership tier assigned.
          </p>
        )}

        <button
          type="button"
          disabled
          className="mt-5 w-full rounded-lg border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white/50"
          title="Coming soon"
        >
          Manage billing (via Stripe)
        </button>
      </section>

      {/* History */}
      <section className="rounded-2xl border border-white/10 bg-surface/60 p-5 shadow-xl backdrop-blur">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">
          Booking history
        </h2>
        <BookingHistoryList
          bookings={history}
          emptyMessage="No past bookings yet"
        />
      </section>

      {/* Logout */}
      <div className="pt-2">
        <LogoutButton className="w-full rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 disabled:opacity-50" />
      </div>
    </div>
  );
}
