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
  allMockBookings,
  findMockMemberById,
  findMockTableById,
} from "./mock-data";
import type {
  Booking,
  BookingInvite,
  BookingStatus,
  Member,
  Table,
} from "@/lib/types";

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
    // Re-fetch member to get latest credit count (RLS: member updates self).
    const { data: memberRow } = await supabase
      .from("members")
      .select("credits_remaining")
      .eq("id", memberId)
      .maybeSingle();

    const current = (memberRow as { credits_remaining: number } | null)
      ?.credits_remaining ?? 0;

    await supabase
      .from("members")
      .update({ credits_remaining: current + creditsToRefund })
      .eq("id", memberId);
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
