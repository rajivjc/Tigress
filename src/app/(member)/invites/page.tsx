import { redirect } from "next/navigation";
import { InviteRow } from "@/components/member/InviteRow";
import { getAllInvites } from "@/lib/data/invites";
import { getCurrentAuthUserId, getMemberProfile } from "@/lib/data/members";
import type { BookingInviteStatus } from "@/lib/types";
import type { InviteWithContext } from "@/lib/data/invites";

export const dynamic = "force-dynamic";

const SECTION_ORDER: BookingInviteStatus[] = [
  "pending",
  "accepted",
  "declined",
];

const SECTION_LABEL: Record<BookingInviteStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
};

export default async function InvitesPage() {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) redirect("/login");

  const member = await getMemberProfile(authUserId);
  if (!member) {
    return (
      <div className="p-4 text-sm text-white/60">
        No member profile linked to this account.
      </div>
    );
  }

  const invites = await getAllInvites(member.id);

  const grouped: Record<BookingInviteStatus, InviteWithContext[]> = {
    pending: [],
    accepted: [],
    declined: [],
  };
  for (const entry of invites) {
    grouped[entry.invite.status].push(entry);
  }

  const totalPending = grouped.pending.length;

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold text-white">Invites</h1>
        <p className="text-xs text-white/50">
          {totalPending > 0
            ? `You have ${totalPending} invite${totalPending === 1 ? "" : "s"} waiting on you`
            : "Invites from other members appear here"}
        </p>
      </header>

      {invites.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/60">
          No invites yet
        </div>
      ) : (
        SECTION_ORDER.map((status) => {
          const items = grouped[status];
          if (items.length === 0) return null;
          return (
            <section key={status}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                {SECTION_LABEL[status]}
                <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">
                  {items.length}
                </span>
              </h2>
              <ul className="space-y-2">
                {items.map((entry) => (
                  <InviteRow key={entry.invite.id} entry={entry} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
