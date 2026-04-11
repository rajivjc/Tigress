"use server";

import { revalidatePath } from "next/cache";
import {
  getCurrentAuthUserId,
  getMemberProfile,
} from "@/lib/data/members";
import {
  cancelBooking,
  createBooking,
  type CreateBookingInput,
} from "@/lib/data/bookings";
import { getAvailableSlots, type TimeSlot } from "@/lib/data/tables";

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

  const result = await cancelBooking(bookingId, member.id);
  if (result.success) {
    revalidatePath("/dashboard");
    revalidatePath("/bookings");
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath("/profile");
  }
  return result;
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
