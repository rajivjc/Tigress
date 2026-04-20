import { redirect } from "next/navigation";
import { FeedClient } from "@/components/feed/FeedClient";
import { listFeed, type CurrentUser } from "@/lib/data/posts";
import { getCurrentStaff } from "@/lib/data/staff";
import { getCurrentAuthUserId, getMemberProfile } from "@/lib/data/members";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  // Resolve the signed-in user — staff first (matching AuthProvider order),
  // then fall back to a member row.
  let currentUser: CurrentUser = null;
  let role: "member" | "staff" | "manager" | "owner" = "member";
  let currentUserKey: { kind: "member" | "staff"; id: string } | null = null;

  const staff = await getCurrentStaff();
  if (staff) {
    currentUser = { kind: "staff", staffId: staff.staff.id };
    role = staff.role;
    currentUserKey = { kind: "staff", id: staff.staff.id };
  } else {
    const authUserId = await getCurrentAuthUserId();
    if (authUserId) {
      const member = await getMemberProfile(authUserId);
      if (member) {
        currentUser = { kind: "member", memberId: member.id };
        role = "member";
        currentUserKey = { kind: "member", id: member.id };
      }
    }
  }

  if (!currentUser || !currentUserKey) {
    // RouteGuard handles this client-side, but bail on the server so the
    // data functions don't see a null user.
    redirect("/login");
  }

  const { posts, nextCursor } = await listFeed({
    limit: 20,
    currentUser,
  });

  return (
    <FeedClient
      initialPosts={posts}
      initialCursor={nextCursor}
      currentRole={role}
      currentUserKey={currentUserKey}
    />
  );
}
