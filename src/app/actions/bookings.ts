"use server";

import { revalidatePath } from "next/cache";
import {
  getCurrentAuthUserId,
  getMemberProfile,
} from "@/lib/data/members";
import { cancelBooking } from "@/lib/data/bookings";

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
