import { AppHeader } from "@/components/ui/AppHeader";
import { MemberNav } from "@/components/ui/MemberNav";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { getCurrentAuthUserId, getMemberProfile } from "@/lib/data/members";
import { getPendingInvites } from "@/lib/data/invites";

export const dynamic = "force-dynamic";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch the pending invite count for the nav badge. We resolve the member
  // defensively here — non-member roles (staff/manager/owner) reuse this
  // layout and simply get a 0 count.
  let pendingInviteCount = 0;
  const authUserId = await getCurrentAuthUserId();
  if (authUserId) {
    const member = await getMemberProfile(authUserId);
    if (member) {
      const invites = await getPendingInvites(member.id);
      pendingInviteCount = invites.length;
    }
  }

  return (
    <RouteGuard allowedRoles={["member", "staff", "manager", "owner"]}>
      <div className="min-h-screen pb-20">
        <AppHeader subtitle="Member" />
        <main className="mx-auto max-w-md">{children}</main>
        <MemberNav pendingInviteCount={pendingInviteCount} />
      </div>
    </RouteGuard>
  );
}
