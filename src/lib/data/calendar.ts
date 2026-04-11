// =============================================================================
// Staff calendar data
// =============================================================================
// Builds a day-view grid for the staff /calendar page: 7 columns (one per
// table) × 14 rows (10:00 → 23:00). Bookings that span multiple hours are
// emitted with `is_start: true` on the first cell and a `span` count, so the
// renderer can use CSS grid `grid-row: span N` to draw a single block.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_BOOKINGS,
  MOCK_TABLES,
  MOCK_WALK_IN_GUESTS,
  findMockMemberById,
} from "./mock-data";
import { dateAtHourSGT, startOfDaySGT } from "@/lib/timezone";
import { _mockBlocksForTesting } from "./blocks";
import {
  VENUE_OPEN_HOUR,
  VENUE_CLOSE_HOUR,
} from "./tables";
import type { BlockedSlot, Booking, Member, Table } from "@/lib/types";

export type CalendarSlotStatus =
  | "available"
  | "booked_member"
  | "booked_walkin"
  | "blocked";

export interface CalendarSlot {
  hour: number; // 10-23
  status: CalendarSlotStatus;
  booking_id?: string;
  block_id?: string;
  /** Member name, walk-in guest name, or block reason — depending on status. */
  label?: string;
  /** How many consecutive hours this booking/block fills (>= 1). */
  span?: number;
  /** True for the first slot of a multi-hour booking/block. */
  is_start?: boolean;
}

export interface CalendarTable {
  table_id: string;
  table_number: number;
  slots: CalendarSlot[];
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  open_hour: number;
  close_hour: number;
  tables: CalendarTable[];
}

interface BookingWithMember extends Booking {
  member?: Pick<Member, "id" | "full_name"> | null;
  walk_in_guest_name?: string | null;
}

// ---------- Public ----------

export async function getCalendarDay(date: string): Promise<CalendarDay> {
  const dayStart = startOfDaySGT(date);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const dayStartIso = dayStart.toISOString();
  const dayEndIso = dayEnd.toISOString();

  const { tables, bookings, blocks } = await fetchDayData(
    dayStartIso,
    dayEndIso
  );

  const calendarTables: CalendarTable[] = tables
    .slice()
    .sort((a, b) => a.table_number - b.table_number)
    .map((table) => ({
      table_id: table.id,
      table_number: table.table_number,
      slots: buildSlotsForTable(
        table.id,
        date,
        bookings.filter((b) => b.table_id === table.id),
        blocks.filter((b) => b.table_id === table.id)
      ),
    }));

  return {
    date,
    open_hour: VENUE_OPEN_HOUR,
    close_hour: VENUE_CLOSE_HOUR,
    tables: calendarTables,
  };
}

// ---------- Slot grid construction ----------

function buildSlotsForTable(
  tableId: string,
  date: string,
  bookings: BookingWithMember[],
  blocks: BlockedSlot[]
): CalendarSlot[] {
  const slots: CalendarSlot[] = [];

  for (let hour = VENUE_OPEN_HOUR; hour < VENUE_CLOSE_HOUR; hour++) {
    const slotStart = dateAtHourSGT(date, hour).toISOString();
    const slotEnd = dateAtHourSGT(date, hour + 1).toISOString();

    const block = blocks.find((b) =>
      rangesOverlap(slotStart, slotEnd, b.starts_at, b.ends_at)
    );
    if (block) {
      slots.push({
        hour,
        status: "blocked",
        block_id: block.id,
        label: block.reason,
      });
      continue;
    }

    const booking = bookings.find((b) =>
      rangesOverlap(slotStart, slotEnd, b.starts_at, b.ends_at)
    );
    if (booking) {
      const isWalkIn = booking.booking_type === "walk_in";
      slots.push({
        hour,
        status: isWalkIn ? "booked_walkin" : "booked_member",
        booking_id: booking.id,
        label: pickLabel(booking),
      });
      continue;
    }

    slots.push({ hour, status: "available" });
  }

  // Collapse runs of identical bookings/blocks into a single "is_start" slot
  // with `span = N`. The other slots in the run still appear in the array
  // but are marked with `span: 0` so the renderer can skip them.
  collapseRuns(slots, "booking_id");
  collapseRuns(slots, "block_id");
  // Mark single-cell entries with span: 1 / is_start: true so the renderer
  // doesn't need a special-case branch.
  for (const slot of slots) {
    if (slot.status === "available") continue;
    if (slot.span === undefined) {
      slot.span = 1;
      slot.is_start = true;
    }
  }

  void tableId; // tableId currently only used for filtering above.
  return slots;
}

function collapseRuns(
  slots: CalendarSlot[],
  key: "booking_id" | "block_id"
): void {
  let i = 0;
  while (i < slots.length) {
    const id = slots[i]?.[key];
    if (!id) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < slots.length && slots[j]?.[key] === id) j += 1;
    const span = j - i;
    const first = slots[i]!;
    first.span = span;
    first.is_start = true;
    for (let k = i + 1; k < j; k++) {
      slots[k]!.span = 0;
      slots[k]!.is_start = false;
    }
    i = j;
  }
}

function pickLabel(booking: BookingWithMember): string {
  if (booking.booking_type === "walk_in") {
    return booking.walk_in_guest_name ?? "Walk-in";
  }
  const fullName = booking.member?.full_name ?? "Member";
  return fullName.split(" ")[0] ?? fullName;
}

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// ---------- Data fetching ----------

interface DayData {
  tables: Pick<Table, "id" | "table_number">[];
  bookings: BookingWithMember[];
  blocks: BlockedSlot[];
}

async function fetchDayData(
  dayStartIso: string,
  dayEndIso: string
): Promise<DayData> {
  if (!isSupabaseConfigured()) {
    const tables = MOCK_TABLES.map((t) => ({
      id: t.id,
      table_number: t.table_number,
    }));
    const bookings: BookingWithMember[] = MOCK_BOOKINGS.filter(
      (b) =>
        b.status === "confirmed" &&
        rangesOverlap(b.starts_at, b.ends_at, dayStartIso, dayEndIso)
    ).map((b) => {
      const guest = MOCK_WALK_IN_GUESTS.find((g) => g.booking_id === b.id);
      return {
        ...b,
        member: b.member_id ? findMockMemberById(b.member_id) : null,
        walk_in_guest_name: guest?.guest_name ?? null,
      };
    });
    const blocks = _mockBlocksForTesting().filter((b) =>
      rangesOverlap(b.starts_at, b.ends_at, dayStartIso, dayEndIso)
    );
    return { tables, bookings, blocks };
  }

  const supabase = createClient();
  const [tablesRes, bookingsRes, blocksRes] = await Promise.all([
    supabase.from("tables").select("id, table_number").order("table_number"),
    supabase
      .from("bookings")
      .select(
        "*, members!bookings_member_id_fkey(id, full_name), walk_in_guests(guest_name)"
      )
      .eq("status", "confirmed")
      .lt("starts_at", dayEndIso)
      .gt("ends_at", dayStartIso),
    supabase
      .from("blocked_slots")
      .select("*")
      .lt("starts_at", dayEndIso)
      .gt("ends_at", dayStartIso),
  ]);

  type SupabaseRow = Booking & {
    members: Pick<Member, "id" | "full_name"> | null;
    walk_in_guests: { guest_name: string }[] | { guest_name: string } | null;
  };
  const bookings: BookingWithMember[] = (
    (bookingsRes.data as SupabaseRow[] | null) ?? []
  ).map((row) => {
    const guest = Array.isArray(row.walk_in_guests)
      ? row.walk_in_guests[0]
      : row.walk_in_guests;
    const { members, walk_in_guests, ...booking } = row;
    void walk_in_guests;
    return {
      ...(booking as Booking),
      member: members,
      walk_in_guest_name: guest?.guest_name ?? null,
    };
  });

  return {
    tables:
      (tablesRes.data as Pick<Table, "id" | "table_number">[] | null) ?? [],
    bookings,
    blocks: (blocksRes.data as BlockedSlot[] | null) ?? [],
  };
}
