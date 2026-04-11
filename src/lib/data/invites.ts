// =============================================================================
// Booking invite accessors
// =============================================================================
// Server-only helpers for fetching the current member's booking invites and
// updating their response. Falls back to mock data when Supabase is not
// configured.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_BOOKING_INVITES,
  allMockBookings,
  findMockMemberById,
  findMockTableById,
} from "./mock-data";
import type {
  Booking,
  BookingInvite,
  BookingInviteStatus,
  Member,
  Table,
} from "@/lib/types";

export interface InviteWithContext {
  invite: BookingInvite;
  inviter: Pick<Member, "id" | "full_name" | "email"> | null;
  booking: Pick<Booking, "id" | "starts_at" | "ends_at" | "status"> | null;
  table: Pick<Table, "id" | "table_number" | "name"> | null;
}

export async function getPendingInvites(
  memberId: string
): Promise<InviteWithContext[]> {
  return getInvitesForMember(memberId, "pending");
}

export async function getAllInvites(
  memberId: string
): Promise<InviteWithContext[]> {
  return getInvitesForMember(memberId);
}

async function getInvitesForMember(
  memberId: string,
  status?: BookingInviteStatus
): Promise<InviteWithContext[]> {
  if (!isSupabaseConfigured()) {
    const rows = MOCK_BOOKING_INVITES.filter(
      (i) => i.invitee_id === memberId && (!status || i.status === status)
    );
    return rows.map(enrichMockInvite);
  }

  const supabase = createClient();
  let query = supabase
    .from("booking_invites")
    .select(
      "*, inviter:members!booking_invites_inviter_id_fkey(id, full_name, email), bookings(id, starts_at, ends_at, status, tables(id, table_number, name))"
    )
    .eq("invitee_id", memberId)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data } = await query;
  return (data as unknown as SupabaseInviteRow[] | null)?.map(
    fromSupabaseRow
  ) ?? [];
}

export async function createInvite(
  bookingId: string,
  inviterId: string,
  inviteeId: string
): Promise<{ success: boolean; inviteId?: string; error?: string }> {
  // ----- Common validation in both modes -----
  if (inviterId === inviteeId) {
    return { success: false, error: "You can't invite yourself" };
  }

  if (!isSupabaseConfigured()) {
    const booking = allMockBookings().find((b) => b.id === bookingId);
    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.member_id !== inviterId) {
      return {
        success: false,
        error: "Only the booking owner can invite members",
      };
    }
    if (booking.status !== "confirmed") {
      return {
        success: false,
        error: "Only confirmed bookings can send invites",
      };
    }
    if (Date.parse(booking.starts_at) <= Date.now()) {
      return { success: false, error: "This booking is in the past" };
    }
    const invitee = findMockMemberById(inviteeId);
    if (!invitee) return { success: false, error: "Invitee not found" };

    const existing = MOCK_BOOKING_INVITES.find(
      (i) => i.booking_id === bookingId && i.invitee_id === inviteeId
    );
    if (existing) {
      return { success: false, error: "Already invited" };
    }

    const id = `mock-invite-${Date.now()}`;
    const nowIso = new Date().toISOString();
    MOCK_BOOKING_INVITES.push({
      id,
      booking_id: bookingId,
      inviter_id: inviterId,
      invitee_id: inviteeId,
      status: "pending",
      created_at: nowIso,
      updated_at: nowIso,
    });
    return { success: true, inviteId: id };
  }

  const supabase = createClient();

  // Validate booking ownership + status.
  const { data: bookingRow, error: bookingErr } = await supabase
    .from("bookings")
    .select("id, member_id, status, starts_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingErr) return { success: false, error: bookingErr.message };
  if (!bookingRow) return { success: false, error: "Booking not found" };

  const booking = bookingRow as Pick<
    Booking,
    "id" | "member_id" | "status" | "starts_at"
  >;
  if (booking.member_id !== inviterId) {
    return {
      success: false,
      error: "Only the booking owner can invite members",
    };
  }
  if (booking.status !== "confirmed") {
    return {
      success: false,
      error: "Only confirmed bookings can send invites",
    };
  }
  if (Date.parse(booking.starts_at) <= Date.now()) {
    return { success: false, error: "This booking is in the past" };
  }

  // Ensure invitee exists.
  const { data: inviteeRow } = await supabase
    .from("members")
    .select("id")
    .eq("id", inviteeId)
    .maybeSingle();
  if (!inviteeRow) return { success: false, error: "Invitee not found" };

  // Ensure no existing invite for this (booking, invitee) pair.
  const { data: existingRow } = await supabase
    .from("booking_invites")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("invitee_id", inviteeId)
    .maybeSingle();
  if (existingRow) {
    return { success: false, error: "Already invited" };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("booking_invites")
    .insert({
      booking_id: bookingId,
      inviter_id: inviterId,
      invitee_id: inviteeId,
      status: "pending",
    })
    .select("id")
    .single();
  if (insertErr) return { success: false, error: insertErr.message };

  return { success: true, inviteId: (inserted as { id: string }).id };
}

export async function respondToInvite(
  inviteId: string,
  memberId: string,
  response: Exclude<BookingInviteStatus, "pending">
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const invite = MOCK_BOOKING_INVITES.find(
      (i) => i.id === inviteId && i.invitee_id === memberId
    );
    if (!invite) return { success: false, error: "Invite not found" };
    invite.status = response;
    invite.updated_at = new Date().toISOString();
    return { success: true };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("booking_invites")
    .update({ status: response })
    .eq("id", inviteId)
    .eq("invitee_id", memberId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ---------- Shape helpers ----------

type SupabaseInviteRow = BookingInvite & {
  inviter: Pick<Member, "id" | "full_name" | "email"> | null;
  bookings:
    | (Pick<Booking, "id" | "starts_at" | "ends_at" | "status"> & {
        tables: Pick<Table, "id" | "table_number" | "name"> | null;
      })
    | null;
};

function fromSupabaseRow(row: SupabaseInviteRow): InviteWithContext {
  const { inviter, bookings, ...invite } = row;
  const { tables, ...bookingCore } = bookings ?? {
    id: "",
    starts_at: "",
    ends_at: "",
    status: "confirmed" as const,
    tables: null,
  };

  return {
    invite: invite as BookingInvite,
    inviter,
    booking: bookings ? (bookingCore as InviteWithContext["booking"]) : null,
    table: bookings ? tables : null,
  };
}

function enrichMockInvite(invite: BookingInvite): InviteWithContext {
  const inviter = findMockMemberById(invite.inviter_id);
  const booking =
    allMockBookings().find((b) => b.id === invite.booking_id) ?? null;
  const table = booking ? findMockTableById(booking.table_id) : null;

  return {
    invite,
    inviter: inviter
      ? {
          id: inviter.id,
          full_name: inviter.full_name,
          email: inviter.email,
        }
      : null,
    booking: booking
      ? {
          id: booking.id,
          starts_at: booking.starts_at,
          ends_at: booking.ends_at,
          status: booking.status,
        }
      : null,
    table: table
      ? {
          id: table.id,
          table_number: table.table_number,
          name: table.name,
        }
      : null,
  };
}
