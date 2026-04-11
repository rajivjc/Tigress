import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { StatusDot } from "@/components/ui/StatusDot";
import {
  MemberNotesEditor,
  MemberNotesView,
} from "@/components/staff/MemberNotesEditor";
import { getMemberDetailById } from "@/lib/data/members";
import { getCurrentStaff } from "@/lib/data/staff";
import {
  formatDateShort,
  formatTimeRange,
  formatMonthYear,
} from "@/lib/format";

export const dynamic = "force-dynamic";

interface StaffMemberDetailPageProps {
  params: { id: string };
}

export default async function StaffMemberDetailPage({
  params,
}: StaffMemberDetailPageProps) {
  const current = await getCurrentStaff();
  if (!current) {
    redirect("/login");
  }

  const detail = await getMemberDetailById(params.id);
  if (!detail) {
    notFound();
  }

  const { member, tier, upcomingBookings, pastBookings } = detail;
  const canEditNotes =
    current.role === "manager" || current.role === "owner";

  return (
    <div className="space-y-4 p-4">
      <Link
        href="/members"
        className="inline-flex items-center text-xs text-white/60 hover:text-white"
      >
        ← All members
      </Link>

      <header className="flex items-start gap-4 rounded-2xl border border-white/10 bg-surface/60 p-5">
        <Avatar name={member.full_name} src={member.avatar_url} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-white">
            {member.full_name}
          </h1>
          <p className="truncate text-sm text-white/60">{member.email}</p>
          {member.phone && (
            <p className="text-xs text-white/40">{member.phone}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {tier && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                {tier.name}
              </span>
            )}
            <StatusDot status={member.subscription_status} />
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <Stat label="Credits" value={member.credits_remaining} />
        <Stat
          label="Joined"
          value={formatMonthYear(`${member.join_date}T12:00:00.000Z`)}
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-surface/60 p-4">
        <p className="mb-3 text-[11px] uppercase tracking-wider text-white/40">
          Upcoming bookings
        </p>
        {upcomingBookings.length === 0 ? (
          <p className="text-sm text-white/40">No upcoming bookings.</p>
        ) : (
          <ul className="space-y-2">
            {upcomingBookings.map(({ booking, table }) => (
              <li
                key={booking.id}
                className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm"
              >
                <p className="font-medium text-white">
                  Table {table?.table_number ?? "?"} ·{" "}
                  {formatDateShort(booking.starts_at)}
                </p>
                <p className="text-xs text-white/50">
                  {formatTimeRange(booking.starts_at, booking.ends_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-surface/60 p-4">
        <p className="mb-3 text-[11px] uppercase tracking-wider text-white/40">
          Recent history
        </p>
        {pastBookings.length === 0 ? (
          <p className="text-sm text-white/40">No past bookings.</p>
        ) : (
          <ul className="space-y-2">
            {pastBookings.map(({ booking, table }) => (
              <li
                key={booking.id}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-white">
                    Table {table?.table_number ?? "?"} ·{" "}
                    {formatDateShort(booking.starts_at)}
                  </p>
                  <p className="text-xs text-white/50">
                    {formatTimeRange(booking.starts_at, booking.ends_at)}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-white/40">
                  {booking.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-surface/60 p-4">
        <p className="mb-3 text-[11px] uppercase tracking-wider text-white/40">
          Admin notes
        </p>
        {canEditNotes ? (
          <MemberNotesEditor
            memberId={member.id}
            initialNotes={member.notes}
          />
        ) : (
          <MemberNotesView notes={member.notes} />
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface/60 p-4 text-center">
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </p>
    </div>
  );
}
