"use client";

// =============================================================================
// TableDetailPanel
// =============================================================================
// Slide-up bottom sheet shown when a table on the floorplan is tapped.
// Content varies by the table's computed status and the viewer's role.
// Members see anonymised "in use" info; staff+ see who's playing.
// =============================================================================

import { useEffect } from "react";
import Link from "next/link";
import { formatDateShort, formatTime, formatTimeRange } from "@/lib/format";
import type { TableWithStatus } from "@/lib/data/tables";
import type { UserRole } from "@/lib/types";

/**
 * When the panel is used inside the member booking flow we switch the body
 * copy from "real-time" status to date-relative information so a member
 * picking a day in the future doesn't see "in use until …" or "session
 * starts in 45 min" which describe the wrong day.
 */
export interface BookingPanelContext {
  /** YYYY-MM-DD the member is currently browsing for. */
  selectedDate: string;
  /** Bookable 1-hour slots on that date (from TableDateAvailability). */
  availableSlots: number;
  /** Total slots in the venue day (informational). */
  totalSlots: number;
  /** Whether the current member already has a booking on this table today. */
  memberHasBooking: boolean;
}

export interface TableDetailPanelProps {
  table: TableWithStatus | null;
  userRole: UserRole;
  onClose: () => void;
  onBook?: (tableId: string) => void;
  onUnblock?: (tableId: string) => void;
  /**
   * When provided, the panel replaces its real-time copy with date-specific
   * hints for the member booking flow.
   */
  bookingContext?: BookingPanelContext;
}

function isManagerRole(role: UserRole): boolean {
  return role === "manager" || role === "owner";
}

function isStaffRole(role: UserRole): boolean {
  return role === "staff" || role === "manager" || role === "owner";
}

function minutesUntil(iso: string): number {
  return Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function TableDetailPanel({
  table,
  userRole,
  onClose,
  onBook,
  onUnblock,
  bookingContext,
}: TableDetailPanelProps) {
  // Close on escape.
  useEffect(() => {
    if (!table) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [table, onClose]);

  if (!table) return null;

  const staff = isStaffRole(userRole);
  const manager = isManagerRole(userRole);
  // In booking context gating is driven by `availableSlots > 0` (date-aware),
  // not the real-time status, so a table that is currently "occupied" still
  // lets the member book a later slot on the selected date.
  const canBook = bookingContext
    ? bookingContext.availableSlots > 0
    : table.computed_status === "available";
  const isOccupied = table.computed_status === "occupied";
  const isReserved = table.computed_status === "reserved";
  const isAvailable = table.computed_status === "available";
  const isBlocked = table.computed_status === "blocked";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Table ${table.table_number} details`}
        className="relative w-full max-w-md rounded-t-3xl border border-white/10 bg-surface-2 p-6 shadow-2xl md:rounded-3xl"
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 md:hidden"
        />

        <header className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/40">
              Table {table.table_number}
            </p>
            <h2 className="mt-1 text-xl font-bold text-white">
              {bookingContext
                ? bookingHeading(bookingContext)
                : statusHeading(table.computed_status)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-white/60 hover:bg-white/5"
          >
            Close
          </button>
        </header>

        <div className="mt-4 space-y-3 text-sm text-white/80">
          {bookingContext ? (
            <BookingContextBody context={bookingContext} />
          ) : (
            <>
              {table.computed_status === "available" && (
                <AvailableBody table={table} />
              )}
              {table.computed_status === "occupied" && (
                <OccupiedBody table={table} staff={staff} />
              )}
              {table.computed_status === "reserved" && (
                <ReservedBody table={table} />
              )}
              {table.computed_status === "blocked" && (
                <BlockedBody table={table} />
              )}
            </>
          )}
        </div>

        <footer className="mt-5 space-y-2">
          <div className="flex gap-2">
            {canBook && onBook && (
              <button
                type="button"
                onClick={() => onBook(table.id)}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-accent/90 active:scale-[0.98]"
              >
                Book this table
              </button>
            )}

            {/* Staff: walk-in shortcut for free tables */}
            {staff && isAvailable && (
              <Link
                href={`/walk-in?table=${encodeURIComponent(table.id)}`}
                className="flex-1 rounded-lg border border-white/20 px-4 py-2.5 text-center text-sm font-medium text-white/80 hover:bg-white/5"
              >
                Add walk-in
              </Link>
            )}

            {/* Staff: open the booking detail for an occupied table */}
            {staff && isOccupied && table.current_booking && (
              <Link
                href={`/bookings/${table.current_booking.id}`}
                className="flex-1 rounded-lg border border-white/20 px-4 py-2.5 text-center text-sm font-medium text-white/80 hover:bg-white/5"
              >
                View booking
              </Link>
            )}

            {/* Staff: open the booking detail for a reserved table */}
            {staff && isReserved && table.next_booking && (
              <Link
                href={`/bookings/${table.next_booking.id}`}
                className="flex-1 rounded-lg border border-white/20 px-4 py-2.5 text-center text-sm font-medium text-white/80 hover:bg-white/5"
              >
                View booking
              </Link>
            )}

            {/* Manager/owner: unblock */}
            {isBlocked && manager && onUnblock && (
              <button
                type="button"
                onClick={() => onUnblock(table.id)}
                className="flex-1 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/5"
              >
                Unblock
              </button>
            )}

            {!canBook && !staff && !(isBlocked && manager) && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/5"
              >
                Got it
              </button>
            )}
          </div>

          {/* Manager/owner: block link, available on any non-blocked table.
              Hidden inside the member booking flow (bookingContext is set
              for members and the block action isn't meaningful there). */}
          {manager && !isBlocked && !bookingContext && (
            <Link
              href={`/block?table=${encodeURIComponent(table.id)}`}
              className="block rounded-lg border border-white/10 px-4 py-2 text-center text-xs font-medium text-white/60 hover:bg-white/5"
            >
              Block this table
            </Link>
          )}
        </footer>
      </div>
    </div>
  );
}

function statusHeading(s: TableWithStatus["computed_status"]): string {
  switch (s) {
    case "available":
      return "Available";
    case "occupied":
      return "Occupied";
    case "reserved":
      return "Reserved";
    case "blocked":
      return "Blocked";
  }
}

// ---------- Bodies ----------

function AvailableBody({ table }: { table: TableWithStatus }) {
  return (
    <>
      <p className="text-white/70">
        This table is free to book right now.
      </p>
      {table.next_booking && (
        <p className="rounded-lg border border-white/10 bg-surface-1/80 p-3 text-xs text-white/60">
          Next reservation at{" "}
          <span className="text-white">
            {formatTime(table.next_booking.starts_at)}
          </span>
        </p>
      )}
    </>
  );
}

function OccupiedBody({
  table,
  staff,
}: {
  table: TableWithStatus;
  staff: boolean;
}) {
  if (!table.current_booking) return null;
  const minsLeft = minutesUntil(table.current_booking.ends_at);

  return (
    <>
      <p className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
        In use until{" "}
        <span className="font-semibold text-amber-300">
          {formatTime(table.current_booking.ends_at)}
        </span>{" "}
        · {formatDuration(minsLeft)} left
      </p>
      {staff && table.current_booking.member_name && (
        <p className="text-xs text-white/60">
          Playing:{" "}
          <span className="text-white">
            {table.current_booking.member_name}
          </span>
        </p>
      )}
      {staff && (
        <p className="text-xs text-white/50">
          {formatTimeRange(
            table.current_booking.starts_at,
            table.current_booking.ends_at
          )}
        </p>
      )}
    </>
  );
}

function ReservedBody({ table }: { table: TableWithStatus }) {
  if (!table.next_booking) return null;
  const mins = minutesUntil(table.next_booking.starts_at);

  return (
    <>
      <p className="rounded-lg border border-blue-400/30 bg-blue-400/5 p-3">
        Session starts in{" "}
        <span className="font-semibold text-blue-300">
          {formatDuration(mins)}
        </span>
      </p>
      <p className="text-xs text-white/60">
        {formatTimeRange(
          table.next_booking.starts_at,
          table.next_booking.ends_at
        )}
      </p>
    </>
  );
}

function BlockedBody({ table }: { table: TableWithStatus }) {
  return (
    <>
      <p className="rounded-lg border border-white/10 bg-white/5 p-3">
        <span className="font-semibold text-white">
          {table.blocked_reason ?? "Unavailable"}
        </span>
      </p>
      {table.blocked_notes && (
        <p className="text-xs text-white/60">{table.blocked_notes}</p>
      )}
    </>
  );
}

// ---------- Booking-context variants ----------

function bookingContextStatus(
  ctx: BookingPanelContext
): "available" | "limited" | "full" {
  if (ctx.availableSlots === 0) return "full";
  if (ctx.availableSlots <= 3) return "limited";
  return "available";
}

function bookingHeading(ctx: BookingPanelContext): string {
  const prettyDate = formatDateShort(`${ctx.selectedDate}T12:00:00.000Z`);
  const variant = bookingContextStatus(ctx);
  if (variant === "full") return `Fully booked on ${prettyDate}`;
  if (variant === "limited") {
    return `${ctx.availableSlots} slot${
      ctx.availableSlots === 1 ? "" : "s"
    } open on ${prettyDate}`;
  }
  return `${ctx.availableSlots} slots open on ${prettyDate}`;
}

function BookingContextBody({ context }: { context: BookingPanelContext }) {
  const variant = bookingContextStatus(context);
  return (
    <>
      {variant === "available" && (
        <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-3 text-white/80">
          Tap{" "}
          <span className="font-semibold text-white">
            &ldquo;Book this table&rdquo;
          </span>{" "}
          to pick a time.
        </p>
      )}
      {variant === "limited" && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-white/80">
          Only{" "}
          <span className="font-semibold text-amber-200">
            {context.availableSlots} slot
            {context.availableSlots === 1 ? "" : "s"}
          </span>{" "}
          left. Tap to pick a time.
        </p>
      )}
      {variant === "full" && (
        <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-white/70">
          No available slots on this date. Try another day or table.
        </p>
      )}
      {context.memberHasBooking && (
        <p className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs text-white/80">
          You already have a booking on this table on this date.
        </p>
      )}
    </>
  );
}
