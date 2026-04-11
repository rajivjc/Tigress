import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingHistoryList } from "@/components/member/BookingHistoryList";
import { getCurrentAuthUserId, getMemberProfile } from "@/lib/data/members";
import {
  getPastBookings,
  getUpcomingBookings,
} from "@/lib/data/bookings";

export const dynamic = "force-dynamic";

type TabKey = "upcoming" | "past";

function isTab(value: string | undefined): value is TabKey {
  return value === "upcoming" || value === "past";
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
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

  const tab: TabKey = isTab(searchParams?.tab) ? searchParams!.tab! : "upcoming";

  const [upcoming, past] = await Promise.all([
    tab === "upcoming" ? getUpcomingBookings(member.id, 50) : Promise.resolve([]),
    tab === "past" ? getPastBookings(member.id, 50) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold text-white">My bookings</h1>
        <p className="text-xs text-white/50">Your reservations at the club</p>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
        <Link
          href="/bookings?tab=upcoming"
          className={`flex-1 rounded-md px-3 py-2 text-center text-xs font-medium transition-colors ${
            tab === "upcoming"
              ? "bg-accent text-white"
              : "text-white/60 hover:text-white"
          }`}
        >
          Upcoming
        </Link>
        <Link
          href="/bookings?tab=past"
          className={`flex-1 rounded-md px-3 py-2 text-center text-xs font-medium transition-colors ${
            tab === "past"
              ? "bg-accent text-white"
              : "text-white/60 hover:text-white"
          }`}
        >
          Past
        </Link>
      </div>

      {tab === "upcoming" ? (
        <BookingHistoryList
          bookings={upcoming}
          emptyMessage="No upcoming bookings"
        />
      ) : (
        <BookingHistoryList
          bookings={past}
          emptyMessage="No past bookings yet"
        />
      )}

      {tab === "upcoming" && (
        <Link
          href="/book"
          className="flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
        >
          Book a table
        </Link>
      )}
    </div>
  );
}
