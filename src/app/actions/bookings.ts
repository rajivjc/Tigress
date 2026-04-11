"use server";

import { revalidatePath } from "next/cache";
import {
  getCurrentAuthUserId,
  getMemberProfile,
} from "@/lib/data/members";
import {
  cancelBooking,
  completeExpiredBookings,
  createBooking,
  getBookingById,
  type CreateBookingInput,
} from "@/lib/data/bookings";
import { getAvailableSlots, type TimeSlot } from "@/lib/data/tables";
import { sendPushToMember, sendPushToMembers } from "@/lib/push/send";
import { formatDateShort, formatTime } from "@/lib/format";

export async function cancelBookingAction(
  bookingId: string
): Promise<{ success: boolean; error?: string }> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { success: false, error: "Not signed in" };
  }
  const member = await getMemberProfile(authUserId);
  if (!member) {
    return { success: false, error: "Member not found" };
  }

  // Capture the booking (with invites) BEFORE cancelling so we can notify
  // everyone who had accepted the invite. After the row flips to `cancelled`
  // some queries/views may still return it, but we want to be certain of the
  // snapshot we saw at cancel time.
  const snapshot = await getBookingById(bookingId);

  const result = await cancelBooking(bookingId, member.id);
  if (result.success) {
    revalidatePath("/dashboard");
    revalidatePath("/bookings");
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath("/profile");
    revalidatePath("/floor");
    revalidatePath("/calendar");

    // Fire-and-forget push notification to every accepted invitee. Errors are
    // swallowed inside sendPushToMembers — a push failure must not block the
    // cancellation response we return to the UI.
    if (snapshot) {
      const acceptedInviteeIds = snapshot.invites
        .filter((i) => i.status === "accepted")
        .map((i) => i.invitee_id);

      if (acceptedInviteeIds.length > 0) {
        const bookerName = snapshot.owner?.full_name ?? "A member";
        const dateLabel = formatDateShort(snapshot.booking.starts_at);
        await sendPushToMembers(acceptedInviteeIds, {
          title: "Session Cancelled",
          body: `${bookerName}'s session on ${dateLabel} has been cancelled.`,
          url: "/bookings",
          tag: `cancel-${bookingId}`,
        });
      }
    }
  }
  return result;
}

/**
 * Sweeps any confirmed bookings whose end time has passed and flips them to
 * `completed`. This is called opportunistically from server-rendered pages
 * (floor, dashboard) instead of a cron job — good enough for Phase 1 scale.
 */
export async function completeExpiredBookingsAction(): Promise<{
  count: number;
}> {
  const count = await completeExpiredBookings();
  return { count };
}

export interface CreateBookingActionInput {
  table_id: string;
  starts_at: string;
  ends_at: string;
  credits_to_use: number;
}

export async function createBookingAction(
  input: CreateBookingActionInput
): Promise<{ success: boolean; bookingId?: string; error?: string }> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { success: false, error: "Not signed in" };
  }
  const member = await getMemberProfile(authUserId);
  if (!member) {
    return { success: false, error: "Member not found" };
  }

  const payload: CreateBookingInput = {
    table_id: input.table_id,
    member_id: member.id,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    credits_to_use: input.credits_to_use,
  };

  const result = await createBooking(payload);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  revalidatePath("/dashboard");
  revalidatePath("/bookings");
  revalidatePath("/book");
  if (result.booking_id) {
    revalidatePath(`/bookings/${result.booking_id}`);
  }

  // Fire-and-forget booking-confirmed push. Table number lookup goes through
  // getBookingById so we get the same shape whether we're in mock or real mode.
  if (result.booking_id) {
    const details = await getBookingById(result.booking_id);
    const tableLabel =
      details?.table?.table_number != null
        ? `Table ${details.table.table_number}`
        : details?.table?.name ?? "Your table";
    const durationHours = Math.round(
      (Date.parse(input.ends_at) - Date.parse(input.starts_at)) / 3600000
    );
    const dateLabel = formatDateShort(input.starts_at);
    const timeLabel = formatTime(input.starts_at);
    await sendPushToMember(member.id, {
      title: "Booking Confirmed",
      body: `${tableLabel} booked for ${durationHours}h on ${dateLabel} at ${timeLabel}.`,
      url: `/bookings/${result.booking_id}`,
      tag: `booking-${result.booking_id}`,
    });
  }

  return { success: true, bookingId: result.booking_id };
}

/**
 * Server action used by the booking flow's time picker to fetch the list of
 * 1-hour slots for a given table + date. Authenticated members only.
 */
export async function getAvailableSlotsAction(
  tableId: string,
  date: string
): Promise<{ slots?: TimeSlot[]; error?: string }> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { error: "Not signed in" };
  }
  try {
    const slots = await getAvailableSlots(tableId, date);
    return { slots };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to load slots",
    };
  }
}
