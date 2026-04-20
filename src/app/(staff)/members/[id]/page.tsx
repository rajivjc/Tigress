import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ShieldOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDot } from "@/components/ui/StatusDot";
import {
  MemberNotesEditor,
  MemberNotesView,
} from "@/components/staff/MemberNotesEditor";
import { LinkStripeCustomerForm } from "@/components/staff/LinkStripeCustomerForm";
import { OwnerMembershipControls } from "@/components/staff/OwnerMembershipControls";
import {
  getNoShowCountForMember,
  getNoShowHistoryForMember,
} from "@/lib/data/bookings";
import { getAllTiers, getMemberDetailById } from "@/lib/data/members";
import { getCurrentStaff } from "@/lib/data/staff";
import { findMockTableById } from "@/lib/data/mock-data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  formatDateShort,
  formatTimeRange,
  formatMonthYear,
} from "@/lib/format";
import type { Booking, Table } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getNoShowDisplayHistory(
  memberId: string
): Promise<Array<{ booking: Booking; table: Pick<Table, "id" | "table_number" | "name"> | null }>> {
  const rows = await getNoShowHistoryForMember(memberId);
  if (rows.length === 0) return [];

  if (!isSupabaseConfigured()) {
    return rows.map((booking) => {
      const t = findMockTableById(booking.table_id);
      return {
        booking,
        table: t
          ? { id: t.id, table_number: t.table_number, name: t.name }
          : null,
      };
    });
  }

  const tableIds = Array.from(new Set(rows.map((b) => b.table_id)));
  const supabase = createClient();
  const { data } = await supabase
    .from("tables")
    .select("id, table_number, name")
    .in("id", tableIds);
  const tableById = new Map<string, Pick<Table, "id" | "table_number" | "name">>();
  for (const t of (data as Pick<Table, "id" | "table_number" | "name">[] | null) ?? []) {
    tableById.set(t.id, t);
  }
  return rows.map((booking) => ({
    booking,
    table: tableById.get(booking.table_id) ?? null,
  }));
}

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
  const isOwner = current.role === "owner";
  const [tiers, noShowCount, noShowHistory] = await Promise.all([
    isOwner ? getAllTiers() : Promise.resolve([]),
    getNoShowCountForMember(member.id),
    getNoShowDisplayHistory(member.id),
  ]);

  return (
    <div className="space-y-4 p-4">
      <Link
        href="/members"
        className="inline-flex items-center text-xs text-white/60 hover:text-white"
      >
        ← All members
      </Link>

      <header className="flex items-start gap-4 rounded-2xl border border-white/10 bg-surface-1 p-5">
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

      {isOwner && (
        <OwnerMembershipControls
          memberId={member.id}
          initialTierId={member.membership_tier_id}
          initialCredits={member.credits_remaining}
          initialStatus={member.subscription_status}
          tiers={tiers}
        />
      )}

      <section className="rounded-2xl border border-white/10 bg-surface-1 p-4">
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
                className="rounded-lg border border-white/10 bg-surface-1/80 p-3 text-sm"
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

      <section className="rounded-2xl border border-white/10 bg-surface-1 p-4">
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
                className="flex items-center justify-between rounded-lg border border-white/10 bg-surface-1/80 p-3 text-sm"
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
                <div className="flex items-center gap-2">
                  {booking.no_show && (
                    <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-200">
                      No-show
                    </span>
                  )}
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    {booking.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-surface-1 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            No-shows
          </p>
          {noShowCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[11px] font-semibold text-rose-200">
              <AlertTriangle size={12} strokeWidth={2} />
              {noShowCount} no-show{noShowCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {noShowHistory.length === 0 ? (
          <EmptyState
            icon={ShieldOff}
            title="No no-shows recorded"
            description="Staff can mark completed bookings as no-shows from the calendar."
          />
        ) : (
          <ul className="space-y-2">
            {noShowHistory.map(({ booking, table }) => (
              <li
                key={booking.id}
                className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-sm"
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

      {isOwner && (
        <section className="rounded-2xl border border-white/10 bg-surface-1 p-4">
          <LinkStripeCustomerForm
            memberId={member.id}
            initialCustomerId={member.stripe_customer_id}
          />
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-surface-1 p-4">
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
    <div className="rounded-xl border border-white/10 bg-surface-1 p-4 text-center">
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </p>
    </div>
  );
}
