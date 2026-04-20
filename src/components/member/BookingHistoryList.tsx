import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateShort, formatTimeRange } from "@/lib/format";
import type { BookingStatus } from "@/lib/types";
import type { BookingWithRelations } from "@/lib/data/bookings";

interface BookingHistoryListProps {
  bookings: BookingWithRelations[];
  emptyMessage?: string;
}

const STATUS_STYLES: Record<BookingStatus, string> = {
  confirmed: "bg-accent/15 text-accent",
  completed: "bg-emerald-500/15 text-emerald-300",
  cancelled: "bg-red-500/15 text-red-300",
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function BookingHistoryList({
  bookings,
  emptyMessage = "No bookings yet",
}: BookingHistoryListProps) {
  if (bookings.length === 0) {
    return <EmptyState icon={CalendarDays} title={emptyMessage} />;
  }

  return (
    <ul className="space-y-2">
      {bookings.map(({ booking, table }) => (
        <li
          key={booking.id}
          className="rounded-lg border border-white/5 bg-surface-1/80 p-3"
        >
          <a
            href={`/bookings/${booking.id}`}
            className="flex items-start justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">
                {table?.name ?? "Unknown table"}
              </div>
              <div className="mt-0.5 truncate text-xs text-white/60">
                {formatDateShort(booking.starts_at)} ·{" "}
                {formatTimeRange(booking.starts_at, booking.ends_at)}
              </div>
              {booking.credits_used > 0 && (
                <div className="mt-1 text-[11px] text-white/40">
                  {booking.credits_used} credit
                  {booking.credits_used === 1 ? "" : "s"} used
                </div>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_STYLES[booking.status]}`}
            >
              {STATUS_LABELS[booking.status]}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
