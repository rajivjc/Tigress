import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { CancelBookingButton } from "@/components/member/CancelBookingButton";
import { InviteMemberButton } from "@/components/member/InviteMemberButton";
import { getBookingById } from "@/lib/data/bookings";
import { getCurrentAuthUserId, getMemberProfile } from "@/lib/data/members";
import { formatDateShort, formatTimeRange } from "@/lib/format";
import type { BookingInviteStatus, BookingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<BookingStatus, string> = {
  confirmed: "bg-accent/15 text-accent",
  completed: "bg-emerald-500/15 text-emerald-300",
  cancelled: "bg-red-500/15 text-red-300",
  no_show: "bg-amber-500/15 text-amber-300",
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

const INVITE_STYLES: Record<BookingInviteStatus, string> = {
  pending: "bg-white/10 text-white/60",
  accepted: "bg-emerald-500/15 text-emerald-300",
  declined: "bg-red-500/15 text-red-300",
};

export default async function BookingDetailPage({
  params,
}: {
  params: { id: string };
}) {
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

  const details = await getBookingById(params.id);
  if (!details) {
    notFound();
  }

  const { booking, table, owner, invites } = details;
  const isOwner = booking.member_id === member.id;
  const isUpcoming =
    new Date(booking.starts_at).getTime() > Date.now() &&
    booking.status === "confirmed";
  const canManage = isOwner && isUpcoming;

  return (
    <div className="space-y-4 p-4">
      <div>
        <Link
          href="/bookings"
          className="text-xs text-white/50 hover:text-white"
        >
          ← Back to bookings
        </Link>
      </div>

      {/* Main info */}
      <section className="rounded-2xl border border-white/10 bg-surface-1 p-5 shadow-xl ">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-white">
              {table?.name ?? "Unknown table"}
            </h1>
            <p className="mt-1 text-sm text-white/70">
              {formatDateShort(booking.starts_at)}
            </p>
            <p className="text-sm text-white/70">
              {formatTimeRange(booking.starts_at, booking.ends_at)}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLES[booking.status]}`}
          >
            {STATUS_LABELS[booking.status]}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-white/5 bg-surface-1/80 p-3">
            <dt className="text-white/40">Credits used</dt>
            <dd className="mt-1 font-medium text-white">
              {booking.credits_used}
            </dd>
          </div>
          <div className="rounded-lg border border-white/5 bg-surface-1/80 p-3">
            <dt className="text-white/40">Type</dt>
            <dd className="mt-1 font-medium capitalize text-white">
              {booking.booking_type.replace("_", " ")}
            </dd>
          </div>
        </dl>

        {booking.notes && (
          <div className="mt-4 rounded-lg border border-white/5 bg-surface-1/80 p-3 text-xs text-white/70">
            <div className="mb-1 uppercase tracking-wider text-white/40">
              Notes
            </div>
            {booking.notes}
          </div>
        )}

        {!isOwner && owner && (
          <p className="mt-4 text-xs text-white/50">
            Hosted by {owner.full_name}
          </p>
        )}
      </section>

      {/* Invited members */}
      <section className="rounded-2xl border border-white/10 bg-surface-1 p-5 shadow-xl ">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
            Invited members
          </h2>
          {canManage && (
            <InviteMemberButton
              bookingId={booking.id}
              ownerMemberId={member.id}
              existingInvites={invites.map((inv) => ({
                invitee_id: inv.invitee_id,
                full_name: inv.invitee.full_name,
                status: inv.status,
              }))}
            />
          )}
        </div>

        {invites.length === 0 ? (
          <p className="mt-3 text-xs text-white/50">No invites on this booking yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center gap-3 rounded-lg border border-white/5 bg-surface-1/80 p-3"
              >
                <Avatar name={invite.invitee.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">
                    {invite.invitee.full_name}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${INVITE_STYLES[invite.status]}`}
                >
                  {invite.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cancel */}
      {canManage && (
        <CancelBookingButton
          bookingId={booking.id}
          creditsUsed={booking.credits_used}
        />
      )}

      {!canManage && !isUpcoming && (
        <p className="rounded-lg border border-dashed border-white/10 bg-surface-1/80 p-3 text-center text-xs text-white/50">
          Past booking — read-only
        </p>
      )}
    </div>
  );
}
