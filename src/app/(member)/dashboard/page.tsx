import { redirect } from "next/navigation";
import { MembershipCard } from "@/components/member/MembershipCard";
import { CreditsCard } from "@/components/member/CreditsCard";
import { UpcomingBookings } from "@/components/member/UpcomingBookings";
import { PendingInvites } from "@/components/member/PendingInvites";
import { getCurrentAuthUserId, getMemberWithTier } from "@/lib/data/members";
import { getUpcomingBookings } from "@/lib/data/bookings";
import { getPendingInvites } from "@/lib/data/invites";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    // RouteGuard usually handles this, but server-side fetch needs a fallback.
    redirect("/login");
  }

  const profile = await getMemberWithTier(authUserId);
  if (!profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface/60 p-6 text-center">
          <h1 className="text-lg font-semibold text-white">
            No member profile
          </h1>
          <p className="mt-2 text-sm text-white/60">
            This account is signed in but has no linked member record.
          </p>
        </div>
      </div>
    );
  }

  const [upcoming, pendingInvites] = await Promise.all([
    getUpcomingBookings(profile.member.id, 3),
    getPendingInvites(profile.member.id),
  ]);

  return (
    <div className="space-y-4 p-4">
      <MembershipCard member={profile.member} tier={profile.tier} />
      <CreditsCard member={profile.member} tier={profile.tier} />
      <UpcomingBookings bookings={upcoming} />
      <PendingInvites invites={pendingInvites} />
    </div>
  );
}
