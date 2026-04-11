import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateShort, formatTimeRange } from "@/lib/format";
import type { BookingWithRelations } from "@/lib/data/bookings";

interface UpcomingBookingsProps {
  bookings: BookingWithRelations[];
}

export function UpcomingBookings({ bookings }: UpcomingBookingsProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-surface-1 p-5 shadow-xl ">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">
          Upcoming bookings
        </h3>
        {bookings.length > 0 && (
          <Link
            href="/bookings"
            className="text-xs font-medium text-accent hover:underline"
          >
            View all
          </Link>
        )}
      </div>

      {bookings.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming bookings"
          actionLabel="Book a table"
          actionHref="/book"
        />
      ) : (
        <ul className="mt-4 space-y-3">
          {bookings.map(({ booking, table, invites }) => {
            const acceptedOrPending = invites.filter(
              (i) => i.status !== "declined"
            );
            return (
              <li key={booking.id}>
                <Link
                  href={`/bookings/${booking.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-surface-1/80 p-3 transition-colors hover:border-white/20 hover:bg-surface-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">
                      {table?.name ?? "Unknown table"}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-white/60">
                      {formatDateShort(booking.starts_at)} ·{" "}
                      {formatTimeRange(booking.starts_at, booking.ends_at)}
                    </div>
                    {acceptedOrPending.length > 0 && (
                      <div className="mt-2 flex items-center gap-1">
                        {acceptedOrPending.slice(0, 4).map((invite) => (
                          <Avatar
                            key={invite.id}
                            name={invite.invitee.full_name}
                            size="sm"
                          />
                        ))}
                        {acceptedOrPending.length > 4 && (
                          <span className="ml-1 text-[10px] text-white/50">
                            +{acceptedOrPending.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-white/40">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
