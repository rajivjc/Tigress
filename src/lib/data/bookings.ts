// =============================================================================
// Booking data accessors
// =============================================================================
// Server-only helpers for fetching bookings with their related table and
// invited-member rows. Falls back to mock data when Supabase is not
// configured.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_BOOKINGS,
  MOCK_BOOKING_INVITES,
  MOCK_INVITED_BOOKINGS,
  MOCK_TABLES,
  MOCK_TIERS,
  allMockBookings,
  findMockMemberById,
  findMockTableById,
} from "./mock-data";
import type {
  BlockedSlot,
  Booking,
  BookingInvite,
  BookingStatus,
  Member,
  Table,
} from "@/lib/types";

// ---------- Constants ----------

/** Minimum bookable session length in minutes. */
const MIN_SESSION_MINUTES = 60;
/** Max bookable session length in hours — mirrors tables.ts. */
const MAX_SESSION_HOURS = 3;

export interface BookingInviteWithMember extends BookingInvite {
  invitee: Pick<Member, "id" | "full_name" | "email">;
}

export interface BookingWithRelations {
  booking: Booking;
  table: Pick<Table, "id" | "table_number" | "name"> | null;
  owner: Pick<Member, "id" | "full_name" | "email"> | null;
  invites: BookingInviteWithMember[];
}

// ---------- Helpers ----------

function compareAsc(a: Booking, b: Booking): number {
  return a.starts_at.localeCompare(b.starts_at);
}

function compareDesc(a: Booking, b: Booking): number {
  return b.starts_at.localeCompare(a.starts_at);
}

// ---------- Upcoming ----------

export async function getUpcomingBookings(
  memberId: string,
  limit = 3
): Promise<BookingWithRelations[]> {
  const nowIso = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const rows = MOCK_BOOKINGS.filter(
      (b) =>
        b.member_id === memberId &&
        b.status === "confirmed" &&
        b.starts_at > nowIso
    )
      .sort(compareAsc)
      .slice(0, limit);

    return rows.map(enrichMockBooking);
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "*, tables(id, table_number, name), members!bookings_member_id_fkey(id, full_name, email), booking_invites(*, invitee:members!booking_invites_invitee_id_fkey(id, full_name, email))"
    )
    .eq("member_id", memberId)
    .eq("status", "confirmed")
    .gt("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(limit);

  return (data as unknown as SupabaseBookingRow[] | null)?.map(
    fromSupabaseRow
  ) ?? [];
}

// ---------- Past ----------

export async function getPastBookings(
  memberId: string,
  limit = 10
): Promise<BookingWithRelations[]> {
  const nowIso = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const rows = MOCK_BOOKINGS.filter(
      (b) =>
        b.member_id === memberId &&
        (b.ends_at < nowIso ||
          b.status === "completed" ||
          b.status === "cancelled" ||
          b.status === "no_show")
    )
      .sort(compareDesc)
      .slice(0, limit);

    return rows.map(enrichMockBooking);
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "*, tables(id, table_number, name), members!bookings_member_id_fkey(id, full_name, email), booking_invites(*, invitee:members!booking_invites_invitee_id_fkey(id, full_name, email))"
    )
    .eq("member_id", memberId)
    .or(
      `ends_at.lt.${nowIso},status.in.(completed,cancelled,no_show)`
    )
    .order("starts_at", { ascending: false })
    .limit(limit);

  return (data as unknown as SupabaseBookingRow[] | null)?.map(
    fromSupabaseRow
  ) ?? [];
}

// ---------- By id ----------

export async function getBookingById(
  bookingId: string
): Promise<BookingWithRelations | null> {
  if (!isSupabaseConfigured()) {
    const row =
      allMockBookings().find((b) => b.id === bookingId) ?? null;
    if (!row) return null;
    return enrichMockBooking(row);
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "*, tables(id, table_number, name), members!bookings_member_id_fkey(id, full_name, email), booking_invites(*, invitee:members!booking_invites_invitee_id_fkey(id, full_name, email))"
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!data) return null;
  return fromSupabaseRow(data as unknown as SupabaseBookingRow);
}

// ---------- Cancel a booking ----------

export async function cancelBooking(
  bookingId: string,
  memberId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_BOOKINGS.find(
      (b) => b.id === bookingId && b.member_id === memberId
    );
    if (!row) {
      return { success: false, error: "Booking not found" };
    }
    if (row.status !== "confirmed") {
      return {
        success: false,
        error: "Only confirmed bookings can be cancelled",
      };
    }
    row.status = "cancelled";
    // Refund credits to the mock member.
    const member = findMockMemberById(memberId);
    if (member) {
      member.credits_remaining += row.credits_used;
    }
    row.credits_used = 0;
    return { success: true };
  }

  const supabase = createClient();

  // Fetch the booking first so we can refund credits on the member row.
  const { data: existing, error: fetchError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("member_id", memberId)
    .maybeSingle();

  if (fetchError) return { success: false, error: fetchError.message };
  if (!existing) return { success: false, error: "Booking not found" };
  if ((existing as Booking).status !== "confirmed") {
    return {
      success: false,
      error: "Only confirmed bookings can be cancelled",
    };
  }

  const creditsToRefund = (existing as Booking).credits_used;

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ status: "cancelled" as BookingStatus, credits_used: 0 })
    .eq("id", bookingId);

  if (updateError) return { success: false, error: updateError.message };

  if (creditsToRefund > 0) {
    // Atomic refund via the refund_credits RPC (see migration 002). Using a
    // single UPDATE inside the database avoids a read-then-update race where
    // two concurrent cancellations could double-refund.
    const { error: rpcError } = await supabase.rpc("refund_credits", {
      p_member_id: memberId,
      p_credits: creditsToRefund,
    });
    if (rpcError) return { success: false, error: rpcError.message };
  }

  return { success: true };
}

// ---------- Shape helpers ----------

type SupabaseBookingRow = Booking & {
  tables: Pick<Table, "id" | "table_number" | "name"> | null;
  members: Pick<Member, "id" | "full_name" | "email"> | null;
  booking_invites:
    | (BookingInvite & {
        invitee: Pick<Member, "id" | "full_name" | "email">;
      })[]
    | null;
};

function fromSupabaseRow(row: SupabaseBookingRow): BookingWithRelations {
  const { tables, members, booking_invites, ...booking } = row;
  return {
    booking: booking as Booking,
    table: tables,
    owner: members,
    invites: (booking_invites ?? []).map((i) => ({
      ...i,
      invitee: i.invitee,
    })),
  };
}

function enrichMockBooking(booking: Booking): BookingWithRelations {
  const table = findMockTableById(booking.table_id);
  const owner = booking.member_id
    ? findMockMemberById(booking.member_id)
    : null;
  const invites: BookingInviteWithMember[] = MOCK_BOOKING_INVITES.filter(
    (i) => i.booking_id === booking.id
  ).map((i) => {
    const invitee = findMockMemberById(i.invitee_id);
    return {
      ...i,
      invitee: invitee
        ? {
            id: invitee.id,
            full_name: invitee.full_name,
            email: invitee.email,
          }
        : { id: i.invitee_id, full_name: "Unknown", email: "" },
    };
  });

  return {
    booking,
    table: table
      ? { id: table.id, table_number: table.table_number, name: table.name }
      : null,
    owner: owner
      ? { id: owner.id, full_name: owner.full_name, email: owner.email }
      : null,
    invites,
  };
}

// Re-export the invited-booking mocks so /invites can resolve them.
export const mockInvitedBookingIds = MOCK_INVITED_BOOKINGS.map((b) => b.id);

// =============================================================================
// Booking creation
// =============================================================================

export interface CreateBookingInput {
  table_id: string;
  member_id: string;
  starts_at: string; // ISO timestamp
  ends_at: string; // ISO timestamp
  credits_to_use: number;
}

export interface CreateBookingResult {
  success: boolean;
  booking_id?: string;
  error?: string;
}

/** Generic range overlap. */
function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// ---------- checkSlotAvailability ----------

/**
 * Returns whether the given (tableId, starts_at, ends_at) range overlaps
 * with an existing confirmed booking or an active blocked_slot.
 * Pass `excludeBookingId` to skip a specific booking row (useful when
 * editing an existing booking in future sessions).
 */
export async function checkSlotAvailability(
  tableId: string,
  startsAt: string,
  endsAt: string,
  excludeBookingId?: string
): Promise<{ available: boolean; reason?: string }> {
  if (!isSupabaseConfigured()) {
    const bookingClash = MOCK_BOOKINGS.find(
      (b) =>
        b.table_id === tableId &&
        b.status === "confirmed" &&
        b.id !== excludeBookingId &&
        rangesOverlap(startsAt, endsAt, b.starts_at, b.ends_at)
    );
    if (bookingClash) {
      return { available: false, reason: "Another booking overlaps this slot" };
    }
    return { available: true };
  }

  const supabase = createClient();

  let bookingQuery = supabase
    .from("bookings")
    .select("id")
    .eq("table_id", tableId)
    .eq("status", "confirmed")
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);

  if (excludeBookingId) {
    bookingQuery = bookingQuery.neq("id", excludeBookingId);
  }

  const { data: bookingRows, error: bookingErr } = await bookingQuery.limit(1);
  if (bookingErr) {
    return { available: false, reason: bookingErr.message };
  }
  if ((bookingRows as { id: string }[] | null)?.length) {
    return { available: false, reason: "Another booking overlaps this slot" };
  }

  const { data: blockRows, error: blockErr } = await supabase
    .from("blocked_slots")
    .select("id, reason")
    .eq("table_id", tableId)
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt)
    .limit(1);

  if (blockErr) {
    return { available: false, reason: blockErr.message };
  }
  if ((blockRows as BlockedSlot[] | null)?.length) {
    const reason =
      (blockRows as BlockedSlot[])[0]?.reason ?? "blocked for maintenance";
    return { available: false, reason: `Table ${reason.toLowerCase()}` };
  }

  return { available: true };
}

// ---------- createBooking ----------

export async function createBooking(
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  // ----- Common validation (runs in both mock + real modes) -----
  const validation = validateCreateBookingInput(input);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  if (!isSupabaseConfigured()) {
    return createBookingMock(input);
  }
  return createBookingReal(input);
}

interface ValidationResult {
  ok: boolean;
  error?: string;
}

function validateCreateBookingInput(
  input: CreateBookingInput
): ValidationResult {
  const startMs = Date.parse(input.starts_at);
  const endMs = Date.parse(input.ends_at);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { ok: false, error: "Invalid start or end time" };
  }
  if (endMs <= startMs) {
    return { ok: false, error: "End time must be after start time" };
  }
  if (startMs <= Date.now()) {
    return { ok: false, error: "Start time must be in the future" };
  }

  const durationMinutes = (endMs - startMs) / 60000;
  if (durationMinutes < MIN_SESSION_MINUTES) {
    return { ok: false, error: "Booking must be at least 1 hour" };
  }
  if (durationMinutes > MAX_SESSION_HOURS * 60) {
    return {
      ok: false,
      error: `Booking cannot exceed ${MAX_SESSION_HOURS} hours`,
    };
  }
  if (input.credits_to_use <= 0) {
    return { ok: false, error: "Credits to use must be positive" };
  }
  return { ok: true };
}

async function createBookingMock(
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  const table = MOCK_TABLES.find((t) => t.id === input.table_id);
  if (!table) return { success: false, error: "Table not found" };

  const member = findMockMemberById(input.member_id);
  if (!member) return { success: false, error: "Member not found" };

  // Credit check.
  if (member.credits_remaining < input.credits_to_use) {
    return {
      success: false,
      error: `Insufficient credits — you need ${input.credits_to_use} but have ${member.credits_remaining}`,
    };
  }

  // Priority window check (tier-driven).
  const tier = MOCK_TIERS.find((t) => t.id === member.membership_tier_id);
  if (tier) {
    const horizonMs =
      Date.now() + tier.priority_booking_days * 24 * 60 * 60 * 1000;
    if (Date.parse(input.starts_at) > horizonMs) {
      return {
        success: false,
        error: `Your ${tier.name} tier can only book ${tier.priority_booking_days} days in advance`,
      };
    }
  }

  // Overlap check.
  const availability = await checkSlotAvailability(
    input.table_id,
    input.starts_at,
    input.ends_at
  );
  if (!availability.available) {
    return {
      success: false,
      error: availability.reason ?? "This slot is no longer available",
    };
  }

  // Insert row.
  const id = `mock-booking-${Date.now()}`;
  const nowIso = new Date().toISOString();
  const row: Booking = {
    id,
    table_id: input.table_id,
    member_id: input.member_id,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    status: "confirmed",
    credits_used: input.credits_to_use,
    booking_type: "member",
    created_by: input.member_id,
    notes: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
  MOCK_BOOKINGS.push(row);

  // Deduct credits in-place.
  member.credits_remaining -= input.credits_to_use;

  return { success: true, booking_id: id };
}

async function createBookingReal(
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  const supabase = createClient();

  // Tier check: ensure start is within priority_booking_days from now.
  const { data: memberRow, error: memberErr } = await supabase
    .from("members")
    .select(
      "id, credits_remaining, membership_tier_id, membership_tiers(priority_booking_days, name)"
    )
    .eq("id", input.member_id)
    .maybeSingle();

  if (memberErr) return { success: false, error: memberErr.message };
  if (!memberRow) return { success: false, error: "Member not found" };

  const member = memberRow as unknown as {
    id: string;
    credits_remaining: number;
    membership_tier_id: string | null;
    membership_tiers: {
      priority_booking_days: number;
      name: string;
    } | null;
  };

  if (member.credits_remaining < input.credits_to_use) {
    return {
      success: false,
      error: `Insufficient credits — you need ${input.credits_to_use} but have ${member.credits_remaining}`,
    };
  }

  if (member.membership_tiers) {
    const horizonMs =
      Date.now() +
      member.membership_tiers.priority_booking_days * 24 * 60 * 60 * 1000;
    if (Date.parse(input.starts_at) > horizonMs) {
      return {
        success: false,
        error: `Your ${member.membership_tiers.name} tier can only book ${member.membership_tiers.priority_booking_days} days in advance`,
      };
    }
  }

  const availability = await checkSlotAvailability(
    input.table_id,
    input.starts_at,
    input.ends_at
  );
  if (!availability.available) {
    return {
      success: false,
      error: availability.reason ?? "This slot is no longer available",
    };
  }

  // Atomically deduct credits first. If the RPC returns false, the member
  // raced another concurrent booking and lost — bail out without inserting.
  const { data: deducted, error: deductErr } = await supabase.rpc(
    "deduct_credits",
    {
      p_member_id: input.member_id,
      p_credits: input.credits_to_use,
    }
  );
  if (deductErr) return { success: false, error: deductErr.message };
  if (deducted === false) {
    return { success: false, error: "Insufficient credits" };
  }

  // Insert the booking row.
  const { data: inserted, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      table_id: input.table_id,
      member_id: input.member_id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      status: "confirmed" as BookingStatus,
      credits_used: input.credits_to_use,
      booking_type: "member",
      created_by: input.member_id,
    })
    .select("id")
    .single();

  if (insertErr) {
    // Refund credits since the insert failed.
    await supabase.rpc("refund_credits", {
      p_member_id: input.member_id,
      p_credits: input.credits_to_use,
    });
    return { success: false, error: insertErr.message };
  }

  return {
    success: true,
    booking_id: (inserted as { id: string }).id,
  };
}
