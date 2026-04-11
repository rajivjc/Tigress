// =============================================================================
// Table data accessors
// =============================================================================
// Server-only helpers for fetching pool tables along with their computed
// real-time status, and for resolving the available booking windows on a
// given date. All functions fall back to mock data when Supabase is not
// configured so the floorplan and booking flow remain usable end-to-end.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_TABLES,
  MOCK_BOOKINGS,
  findMockMemberById,
} from "./mock-data";
import type {
  BlockedSlot,
  Booking,
  Member,
  Table,
} from "@/lib/types";

// ---------- Types ----------

export type ComputedTableStatus =
  | "available"
  | "occupied"
  | "reserved"
  | "blocked";

export interface CurrentBookingInfo {
  id: string;
  member_name: string | null;
  starts_at: string;
  ends_at: string;
}

export interface NextBookingInfo {
  id: string;
  starts_at: string;
  ends_at: string;
}

export interface TableWithStatus {
  id: string;
  table_number: number;
  name: string;
  computed_status: ComputedTableStatus;
  current_booking?: CurrentBookingInfo;
  next_booking?: NextBookingInfo;
  blocked_reason?: string;
  blocked_notes?: string | null;
}

export interface TimeSlot {
  /** ISO start timestamp */
  starts_at: string;
  /** ISO end timestamp */
  ends_at: string;
  /** Whether this window is bookable. */
  available: boolean;
  /** When !available, a short reason string (e.g. "Booked", "Blocked"). */
  reason?: string;
}

// ---------- Constants ----------

/** "Reserved" = a confirmed booking starting within this window from now. */
export const RESERVED_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Venue opening/closing hours used for slot generation (local time). */
export const VENUE_OPEN_HOUR = 10; // 10:00
export const VENUE_CLOSE_HOUR = 24; // midnight (exclusive)

/** Slot granularity for the time picker. */
export const SLOT_STEP_MINUTES = 60;

/** Maximum session length a single member can book in one go. */
export const MAX_SESSION_HOURS = 3;

// ---------- Helpers ----------

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function isInRange(nowIso: string, start: string, end: string): boolean {
  return start <= nowIso && nowIso < end;
}

// ---------- Fetch tables with computed status ----------

export async function getTablesWithStatus(
  now: Date = new Date()
): Promise<TableWithStatus[]> {
  const nowIso = now.toISOString();
  const horizonIso = new Date(now.getTime() + RESERVED_WINDOW_MS).toISOString();

  if (!isSupabaseConfigured()) {
    // Layer synthetic "live" bookings/blocks on top of the real mock bookings
    // so the floorplan demo shows a mix of occupied / reserved / blocked.
    const synthetic = buildMockFloorState(now);
    return MOCK_TABLES.map((t) => {
      const realBookings = MOCK_BOOKINGS.filter(
        (b) => b.table_id === t.id && b.status === "confirmed"
      );
      const mockBookings = [
        ...realBookings,
        ...synthetic.bookings.filter((b) => b.table_id === t.id),
      ];
      const mockBlocks = synthetic.blocks.filter((b) => b.table_id === t.id);
      return computeStatus(
        t,
        mockBookings,
        mockBlocks,
        nowIso,
        horizonIso,
        (memberId) => findMockMemberById(memberId)
      );
    });
  }

  const supabase = createClient();

  const [tablesRes, bookingsRes, blocksRes] = await Promise.all([
    supabase.from("tables").select("*").order("table_number"),
    supabase
      .from("bookings")
      .select("*, members!bookings_member_id_fkey(id, full_name)")
      .eq("status", "confirmed")
      .lt("starts_at", horizonIso)
      .gt("ends_at", nowIso),
    supabase
      .from("blocked_slots")
      .select("*")
      .lt("starts_at", horizonIso)
      .gt("ends_at", nowIso),
  ]);

  const tables = (tablesRes.data as Table[] | null) ?? [];
  const bookings =
    (bookingsRes.data as
      | (Booking & { members: Pick<Member, "id" | "full_name"> | null })[]
      | null) ?? [];
  const blocks = (blocksRes.data as BlockedSlot[] | null) ?? [];

  return tables.map((t) => {
    const tableBookings = bookings.filter((b) => b.table_id === t.id);
    const tableBlocks = blocks.filter((b) => b.table_id === t.id);
    return computeStatus(
      t,
      tableBookings,
      tableBlocks,
      nowIso,
      horizonIso,
      () => null,
      tableBookings.reduce<Record<string, Pick<Member, "id" | "full_name">>>(
        (acc, b) => {
          if (b.members) acc[b.id] = b.members;
          return acc;
        },
        {}
      )
    );
  });
}

function computeStatus(
  table: Table,
  bookings: Booking[],
  blocks: BlockedSlot[],
  nowIso: string,
  horizonIso: string,
  resolveMember: (id: string) => Member | null,
  bookingMembers: Record<string, Pick<Member, "id" | "full_name">> = {}
): TableWithStatus {
  const base: TableWithStatus = {
    id: table.id,
    table_number: table.table_number,
    name: table.name,
    computed_status: "available",
  };

  // 1. Blocked wins.
  const activeBlock = blocks.find((b) => isInRange(nowIso, b.starts_at, b.ends_at));
  if (activeBlock) {
    return {
      ...base,
      computed_status: "blocked",
      blocked_reason: activeBlock.reason,
      blocked_notes: activeBlock.notes,
    };
  }

  // 2. Occupied — booking currently in progress.
  const current = bookings.find((b) => isInRange(nowIso, b.starts_at, b.ends_at));
  if (current) {
    const name =
      bookingMembers[current.id]?.full_name ??
      (current.member_id ? resolveMember(current.member_id)?.full_name ?? null : null);
    return {
      ...base,
      computed_status: "occupied",
      current_booking: {
        id: current.id,
        member_name: name,
        starts_at: current.starts_at,
        ends_at: current.ends_at,
      },
    };
  }

  // 3. Reserved — confirmed booking starting within the next RESERVED_WINDOW_MS.
  const upcoming = bookings
    .filter((b) => b.starts_at > nowIso && b.starts_at < horizonIso)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  if (upcoming) {
    return {
      ...base,
      computed_status: "reserved",
      next_booking: {
        id: upcoming.id,
        starts_at: upcoming.starts_at,
        ends_at: upcoming.ends_at,
      },
    };
  }

  return base;
}

// ---------- Fetch a single table by id ----------

export async function getTableById(tableId: string): Promise<Table | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_TABLES.find((t) => t.id === tableId) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("tables")
    .select("*")
    .eq("id", tableId)
    .maybeSingle();
  return (data as Table | null) ?? null;
}

// ---------- Available slots for a given table + date ----------

/**
 * Returns a list of 1-hour time slots between VENUE_OPEN_HOUR and
 * VENUE_CLOSE_HOUR for the given YYYY-MM-DD date, marking each as
 * available or unavailable based on bookings/blocked_slots overlap.
 *
 * The date is interpreted in the server's local timezone so it aligns with
 * the user's calendar.
 */
export async function getAvailableSlots(
  tableId: string,
  date: string
): Promise<TimeSlot[]> {
  const dayStart = startOfDay(date);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const { bookings, blocks } = await fetchDayOccupancy(
    tableId,
    dayStart.toISOString(),
    dayEnd.toISOString()
  );

  const slots: TimeSlot[] = [];
  const nowMs = Date.now();

  for (let hour = VENUE_OPEN_HOUR; hour < VENUE_CLOSE_HOUR; hour++) {
    const slotStart = new Date(dayStart);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const startIso = slotStart.toISOString();
    const endIso = slotEnd.toISOString();

    // Past slots are never available.
    if (slotStart.getTime() <= nowMs) {
      slots.push({
        starts_at: startIso,
        ends_at: endIso,
        available: false,
        reason: "Past",
      });
      continue;
    }

    const clashingBooking = bookings.find((b) =>
      rangesOverlap(startIso, endIso, b.starts_at, b.ends_at)
    );
    if (clashingBooking) {
      slots.push({
        starts_at: startIso,
        ends_at: endIso,
        available: false,
        reason: "Booked",
      });
      continue;
    }

    const clashingBlock = blocks.find((b) =>
      rangesOverlap(startIso, endIso, b.starts_at, b.ends_at)
    );
    if (clashingBlock) {
      slots.push({
        starts_at: startIso,
        ends_at: endIso,
        available: false,
        reason: "Blocked",
      });
      continue;
    }

    slots.push({
      starts_at: startIso,
      ends_at: endIso,
      available: true,
    });
  }

  return slots;
}

async function fetchDayOccupancy(
  tableId: string,
  dayStartIso: string,
  dayEndIso: string
): Promise<{ bookings: Booking[]; blocks: BlockedSlot[] }> {
  if (!isSupabaseConfigured()) {
    const bookings = MOCK_BOOKINGS.filter(
      (b) =>
        b.table_id === tableId &&
        b.status === "confirmed" &&
        rangesOverlap(b.starts_at, b.ends_at, dayStartIso, dayEndIso)
    );
    return { bookings, blocks: [] };
  }

  const supabase = createClient();
  const [bookingsRes, blocksRes] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .eq("table_id", tableId)
      .eq("status", "confirmed")
      .lt("starts_at", dayEndIso)
      .gt("ends_at", dayStartIso),
    supabase
      .from("blocked_slots")
      .select("*")
      .eq("table_id", tableId)
      .lt("starts_at", dayEndIso)
      .gt("ends_at", dayStartIso),
  ]);

  return {
    bookings: (bookingsRes.data as Booking[] | null) ?? [],
    blocks: (blocksRes.data as BlockedSlot[] | null) ?? [],
  };
}

/**
 * Builds a small set of synthetic bookings/blocks for mock mode so the
 * floorplan shows a realistic mix of states without polluting Mona's own
 * booking list (these use other member ids / tables not on her roster).
 */
function buildMockFloorState(now: Date): {
  bookings: Booking[];
  blocks: BlockedSlot[];
} {
  const iso = (offsetMin: number) =>
    new Date(now.getTime() + offsetMin * 60 * 1000).toISOString();
  const fixed = "2025-01-01T00:00:00.000Z";

  const bookings: Booking[] = [
    // Table 2 — currently in use (occupied)
    {
      id: "mock-live-1",
      table_id: "table-2",
      member_id: "mock-member-row-4",
      starts_at: iso(-40),
      ends_at: iso(50),
      status: "confirmed",
      credits_used: 1,
      booking_type: "member",
      created_by: "mock-member-row-4",
      notes: null,
      created_at: fixed,
      updated_at: fixed,
    },
    // Table 5 — starts in 45 minutes (reserved, within 2h window)
    {
      id: "mock-live-2",
      table_id: "table-5",
      member_id: "mock-member-row-2",
      starts_at: iso(45),
      ends_at: iso(45 + 120),
      status: "confirmed",
      credits_used: 1,
      booking_type: "member",
      created_by: "mock-member-row-2",
      notes: null,
      created_at: fixed,
      updated_at: fixed,
    },
  ];

  const blocks: BlockedSlot[] = [
    // Table 7 — blocked for maintenance right now
    {
      id: "mock-block-1",
      table_id: "table-7",
      starts_at: iso(-60),
      ends_at: iso(180),
      reason: "Maintenance",
      notes: "Felt re-covering in progress",
      created_by: "mock-staff-1",
      created_at: fixed,
    },
  ];

  return { bookings, blocks };
}

function startOfDay(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date();
  dt.setFullYear(y!, (m ?? 1) - 1, d ?? 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
