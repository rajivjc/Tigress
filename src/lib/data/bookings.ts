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
  MOCK_WALK_IN_GUESTS,
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
          b.status === "cancelled")
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
      `ends_at.lt.${nowIso},status.in.(completed,cancelled)`
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

// ---------- Auto-complete expired bookings ----------

/**
 * Opportunistic sweep that flips any confirmed booking whose `ends_at` has
 * passed into the `completed` state. Called from server-rendered pages that
 * show booking status (floor, dashboard) so the status stays fresh without
 * needing a dedicated cron job. At Phase 1 scale (~30 members, 7 tables)
 * this is cheap enough to run on every render.
 */
export async function completeExpiredBookings(): Promise<number> {
  const nowIso = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    let count = 0;
    for (const b of MOCK_BOOKINGS) {
      if (b.status === "confirmed" && b.ends_at < nowIso) {
        b.status = "completed";
        b.updated_at = nowIso;
        count++;
      }
    }
    return count;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "completed" as BookingStatus })
    .eq("status", "confirmed")
    .lt("ends_at", nowIso)
    .select("id");

  if (error) return 0;
  return (data as { id: string }[] | null)?.length ?? 0;
}

// ---------- No-show ----------

/**
 * Mark a completed booking as a no-show. The "completed-only" rule is
 * enforced here (not via a CHECK constraint, because that would conflict
 * with the auto-complete sweep's UPDATE ordering). Caller is also expected
 * to enforce the 48-hour staleness guard at the action layer.
 */
export async function markNoShow(
  bookingId: string,
  staffId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_BOOKINGS.find((b) => b.id === bookingId);
    if (!row) return { success: false, error: "Booking not found" };
    if (row.status !== "completed") {
      return {
        success: false,
        error: "Only completed bookings can be marked as no-show",
      };
    }
    if (row.no_show) return { success: true };
    row.no_show = true;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }

  const supabase = createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("bookings")
    .select("id, status, no_show, member_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (fetchError) return { success: false, error: fetchError.message };
  if (!existing) return { success: false, error: "Booking not found" };

  const row = existing as Pick<Booking, "id" | "status" | "no_show" | "member_id">;
  if (row.status !== "completed") {
    return {
      success: false,
      error: "Only completed bookings can be marked as no-show",
    };
  }
  if (row.no_show) return { success: true };

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ no_show: true })
    .eq("id", bookingId);
  if (updateError) return { success: false, error: updateError.message };

  await writeNoShowAuditLog("no_show_marked", row.id, row.member_id, staffId);
  return { success: true };
}

/** Reverse a previous mark — also completed-only. */
export async function unmarkNoShow(
  bookingId: string,
  staffId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_BOOKINGS.find((b) => b.id === bookingId);
    if (!row) return { success: false, error: "Booking not found" };
    if (row.status !== "completed") {
      return {
        success: false,
        error: "Only completed bookings can be unmarked",
      };
    }
    if (!row.no_show) {
      return { success: false, error: "Booking is not marked as no-show" };
    }
    row.no_show = false;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }

  const supabase = createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("bookings")
    .select("id, status, no_show, member_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (fetchError) return { success: false, error: fetchError.message };
  if (!existing) return { success: false, error: "Booking not found" };

  const row = existing as Pick<Booking, "id" | "status" | "no_show" | "member_id">;
  if (row.status !== "completed") {
    return {
      success: false,
      error: "Only completed bookings can be unmarked",
    };
  }
  if (!row.no_show) {
    return { success: false, error: "Booking is not marked as no-show" };
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ no_show: false })
    .eq("id", bookingId);
  if (updateError) return { success: false, error: updateError.message };

  await writeNoShowAuditLog("no_show_unmarked", row.id, row.member_id, staffId);
  return { success: true };
}

/** Total count of no-show bookings for a member. */
export async function getNoShowCountForMember(
  memberId: string
): Promise<number> {
  if (!isSupabaseConfigured()) {
    return MOCK_BOOKINGS.filter(
      (b) => b.member_id === memberId && b.no_show === true
    ).length;
  }

  const supabase = createClient();
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("no_show", true);
  return count ?? 0;
}

/**
 * Last 50 no-show bookings for the member, newest first. Bounded so the
 * query stays cheap even for members with a long history.
 */
export async function getNoShowHistoryForMember(
  memberId: string
): Promise<Booking[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_BOOKINGS.filter(
      (b) => b.member_id === memberId && b.no_show === true
    )
      .slice()
      .sort(compareDesc)
      .slice(0, 50);
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("bookings")
    .select("*")
    .eq("member_id", memberId)
    .eq("no_show", true)
    .order("starts_at", { ascending: false })
    .limit(50);
  return (data as Booking[] | null) ?? [];
}

// ---------- Booking reminders ----------

export interface BookingWithMember {
  booking_id: string;
  member_id: string;
  member_name: string;
  table_number: number;
  starts_at: string;
  ends_at: string;
}

/**
 * Confirmed member bookings whose start time falls inside the given UTC
 * window AND that have not yet been reminded. Drives the
 * `/api/cron/booking-reminders` route — the caller computes the window as
 * `[now+45min, now+75min]` so each booking is reminded exactly once with the
 * 15-minute cron cadence.
 */
export async function getBookingsNeedingReminder(
  windowStartUtc: string,
  windowEndUtc: string
): Promise<BookingWithMember[]> {
  if (!isSupabaseConfigured()) {
    // Mock mode: the cron never actually runs without Supabase, but we still
    // let the function resolve so the route handler returns { sent: 0 }
    // cleanly when called locally for testing.
    const rows = MOCK_BOOKINGS.filter(
      (b) =>
        b.status === "confirmed" &&
        b.booking_type === "member" &&
        b.member_id !== null &&
        b.reminder_sent_at === null &&
        b.starts_at >= windowStartUtc &&
        b.starts_at < windowEndUtc
    );
    return rows
      .map((b) => {
        const member = b.member_id ? findMockMemberById(b.member_id) : null;
        const table = findMockTableById(b.table_id);
        if (!member || !table) return null;
        return {
          booking_id: b.id,
          member_id: member.id,
          member_name: member.full_name,
          table_number: table.table_number,
          starts_at: b.starts_at,
          ends_at: b.ends_at,
        };
      })
      .filter((r): r is BookingWithMember => r !== null);
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, member_id, starts_at, ends_at, tables(table_number), members!bookings_member_id_fkey(full_name)"
    )
    .eq("status", "confirmed")
    .eq("booking_type", "member")
    .is("reminder_sent_at", null)
    .gte("starts_at", windowStartUtc)
    .lt("starts_at", windowEndUtc);

  type Row = {
    id: string;
    member_id: string | null;
    starts_at: string;
    ends_at: string;
    tables: { table_number: number } | null;
    members: { full_name: string } | null;
  };

  return ((data as unknown as Row[] | null) ?? [])
    .map((r) => {
      if (!r.member_id || !r.tables || !r.members) return null;
      return {
        booking_id: r.id,
        member_id: r.member_id,
        member_name: r.members.full_name,
        table_number: r.tables.table_number,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
      };
    })
    .filter((r): r is BookingWithMember => r !== null);
}

/**
 * Stamps `reminder_sent_at = now()` on a single booking so subsequent cron
 * runs skip it. Called after a push send attempt — idempotent by column
 * constraint.
 */
export async function markReminderSent(
  bookingId: string
): Promise<{ success: boolean }> {
  const nowIso = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const row = MOCK_BOOKINGS.find((b) => b.id === bookingId);
    if (row) {
      row.reminder_sent_at = nowIso;
      row.updated_at = nowIso;
    }
    return { success: true };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ reminder_sent_at: nowIso })
    .eq("id", bookingId);
  return { success: !error };
}

async function writeNoShowAuditLog(
  action: "no_show_marked" | "no_show_unmarked",
  bookingId: string,
  memberId: string | null,
  staffId: string
): Promise<void> {
  // Audit logging never blocks the caller. The action layer already returned
  // success at this point, so swallow any errors quietly.
  try {
    const supabase = createClient();
    await supabase.from("audit_log").insert({
      actor_id: staffId,
      action,
      entity_type: "booking",
      entity_id: bookingId,
      metadata: {
        booking_id: bookingId,
        member_id: memberId,
        [action === "no_show_marked"
          ? "marked_by_staff_id"
          : "unmarked_by_staff_id"]: staffId,
      },
    });
  } catch {
    /* best effort */
  }
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
    if (Date.parse(row.starts_at) <= Date.now()) {
      return {
        success: false,
        error: "Cannot cancel a booking that has already started",
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
  if (Date.parse((existing as Booking).starts_at) <= Date.now()) {
    return {
      success: false,
      error: "Cannot cancel a booking that has already started",
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

// NOTE: `created_by` stores the domain entity ID (members.id for member
// bookings, staff.id for walk-ins and admin blocks) — NOT the auth_user_id.
// The column has no FK constraint, so this convention is enforced by the
// action layer. Consumers wanting the auth user should join through the
// appropriate domain table.
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

  // Subscription must be active.
  if (member.subscription_status !== "active") {
    return {
      success: false,
      error:
        "Your membership is not active. Please contact the club to renew.",
    };
  }

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

  // Overlap check on the target table.
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

  // Prevent the same member from holding two confirmed bookings at once
  // (across ANY table).
  const memberClash = MOCK_BOOKINGS.find(
    (b) =>
      b.member_id === input.member_id &&
      b.status === "confirmed" &&
      rangesOverlap(input.starts_at, input.ends_at, b.starts_at, b.ends_at)
  );
  if (memberClash) {
    return {
      success: false,
      error: "You already have a booking during this time",
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
    no_show: false,
    reminder_sent_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
  MOCK_BOOKINGS.push(row);

  // Deduct credits in-place.
  member.credits_remaining -= input.credits_to_use;

  return { success: true, booking_id: id };
}

// =============================================================================
// Walk-in creation
// =============================================================================

export interface CreateWalkInInput {
  table_id: string;
  starts_at: string;
  ends_at: string;
  guest_name: string;
  guest_phone?: string | null;
  guest_count: number;
  comments?: string | null;
  deposit_required: boolean;
  deposit_paid: boolean;
  /** Staff (or auth user) id who created the walk-in row. */
  created_by: string;
}

export interface CreateWalkInResult {
  success: boolean;
  booking_id?: string;
  error?: string;
}

function validateWalkInInput(input: CreateWalkInInput): string | null {
  const startMs = Date.parse(input.starts_at);
  const endMs = Date.parse(input.ends_at);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return "Invalid start or end time";
  }
  if (endMs <= startMs) {
    return "End time must be after start time";
  }
  if (startMs <= Date.now() - 60 * 1000) {
    // Allow a small slack for "right now" walk-ins.
    return "Start time must be in the future";
  }
  const durationMinutes = (endMs - startMs) / 60000;
  if (durationMinutes < MIN_SESSION_MINUTES) {
    return "Walk-in must be at least 1 hour";
  }
  if (durationMinutes > MAX_SESSION_HOURS * 60) {
    return `Walk-in cannot exceed ${MAX_SESSION_HOURS} hours`;
  }
  if (!input.guest_name || input.guest_name.trim().length === 0) {
    return "Guest name is required";
  }
  if (input.guest_count < 1) {
    return "Guest count must be at least 1";
  }
  // Guard: if deposit_paid is true, deposit_required must also be true.
  // The reverse (required but not yet paid) is valid — staff will collect later.
  if (input.deposit_paid && !input.deposit_required) {
    return "Cannot mark deposit paid when deposit is not required";
  }
  return null;
}

export async function createWalkIn(
  input: CreateWalkInInput
): Promise<CreateWalkInResult> {
  const error = validateWalkInInput(input);
  if (error) return { success: false, error };

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

  if (!isSupabaseConfigured()) {
    const table = MOCK_TABLES.find((t) => t.id === input.table_id);
    if (!table) return { success: false, error: "Table not found" };

    const id = `mock-walkin-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const booking: Booking = {
      id,
      table_id: input.table_id,
      member_id: null,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      status: "confirmed",
      credits_used: 0,
      booking_type: "walk_in",
      created_by: input.created_by,
      notes: null,
      no_show: false,
      reminder_sent_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
    MOCK_BOOKINGS.push(booking);
    MOCK_WALK_IN_GUESTS.push({
      id: `mock-guest-${Date.now()}`,
      booking_id: id,
      guest_name: input.guest_name.trim(),
      guest_phone: input.guest_phone ?? null,
      guest_count: input.guest_count,
      deposit_required: input.deposit_required,
      deposit_paid: input.deposit_paid,
      comments: input.comments ?? null,
      created_at: nowIso,
    });
    return { success: true, booking_id: id };
  }

  const supabase = createClient();
  const { data: inserted, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      table_id: input.table_id,
      member_id: null,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      status: "confirmed" as BookingStatus,
      credits_used: 0,
      booking_type: "walk_in",
      created_by: input.created_by,
    })
    .select("id")
    .single();

  if (insertErr) return { success: false, error: insertErr.message };
  const bookingId = (inserted as { id: string }).id;

  const { error: guestErr } = await supabase.from("walk_in_guests").insert({
    booking_id: bookingId,
    guest_name: input.guest_name.trim(),
    guest_phone: input.guest_phone ?? null,
    guest_count: input.guest_count,
    deposit_required: input.deposit_required,
    deposit_paid: input.deposit_paid,
    comments: input.comments ?? null,
  });

  if (guestErr) {
    // Roll back the booking row so the table doesn't end up double-booked.
    await supabase.from("bookings").delete().eq("id", bookingId);
    return { success: false, error: guestErr.message };
  }

  return { success: true, booking_id: bookingId };
}

async function createBookingReal(
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  const supabase = createClient();

  // Tier check: ensure start is within priority_booking_days from now.
  const { data: memberRow, error: memberErr } = await supabase
    .from("members")
    .select(
      "id, credits_remaining, membership_tier_id, subscription_status, membership_tiers(priority_booking_days, name)"
    )
    .eq("id", input.member_id)
    .maybeSingle();

  if (memberErr) return { success: false, error: memberErr.message };
  if (!memberRow) return { success: false, error: "Member not found" };

  const member = memberRow as unknown as {
    id: string;
    credits_remaining: number;
    membership_tier_id: string | null;
    subscription_status: string;
    membership_tiers: {
      priority_booking_days: number;
      name: string;
    } | null;
  };

  if (member.subscription_status !== "active") {
    return {
      success: false,
      error:
        "Your membership is not active. Please contact the club to renew.",
    };
  }

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

  // NOTE: There is a small TOCTOU window between this availability check and
  // the booking INSERT below. At Phase 1 scale (~30 members, 7 tables) the
  // risk is negligible. For Phase 2+, consider a Postgres exclusion constraint
  // on (table_id, tstzrange(starts_at, ends_at)) with status = 'confirmed'
  // to enforce overlap prevention at the DB level.
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

  // Prevent the same member from holding two confirmed bookings at once
  // across ANY table.
  const { data: memberClash, error: clashErr } = await supabase
    .from("bookings")
    .select("id")
    .eq("member_id", input.member_id)
    .eq("status", "confirmed")
    .lt("starts_at", input.ends_at)
    .gt("ends_at", input.starts_at)
    .limit(1);
  if (clashErr) return { success: false, error: clashErr.message };
  if ((memberClash as { id: string }[] | null)?.length) {
    return {
      success: false,
      error: "You already have a booking during this time",
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
