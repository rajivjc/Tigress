"use server";

import { revalidatePath } from "next/cache";
import {
  getBookingById,
  getNoShowCountForMember,
  getNoShowHistoryForMember,
  markNoShow,
  unmarkNoShow,
} from "@/lib/data/bookings";
import { getCurrentStaff } from "@/lib/data/staff";
import type { Booking } from "@/lib/types";

/**
 * 48 hours in milliseconds. The mark/unmark guard window — past this, staff
 * have to ask a manager to fix the record manually so old bookings can't be
 * silently rewritten.
 */
const MARK_WINDOW_MS = 48 * 60 * 60 * 1000;

function withinMarkWindow(endsAtIso: string): boolean {
  const ageMs = Date.now() - Date.parse(endsAtIso);
  return ageMs >= 0 && ageMs <= MARK_WINDOW_MS;
}

export async function markNoShowAction(
  bookingId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };

  const detail = await getBookingById(bookingId);
  if (!detail) return { success: false, error: "Booking not found" };
  if (detail.booking.status !== "completed") {
    return {
      success: false,
      error: "Only completed bookings can be marked as no-show",
    };
  }
  if (!withinMarkWindow(detail.booking.ends_at)) {
    return {
      success: false,
      error:
        "This booking is older than 48 hours — ask a manager to update it manually",
    };
  }

  const result = await markNoShow(bookingId, current.staff.id);
  if (result.success) {
    revalidatePath("/calendar");
    revalidatePath("/floor");
    if (detail.booking.member_id) {
      revalidatePath(`/members/${detail.booking.member_id}`);
    }
  }
  return result;
}

export async function unmarkNoShowAction(
  bookingId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };

  const detail = await getBookingById(bookingId);
  if (!detail) return { success: false, error: "Booking not found" };
  if (detail.booking.status !== "completed") {
    return {
      success: false,
      error: "Only completed bookings can be unmarked",
    };
  }
  if (!withinMarkWindow(detail.booking.ends_at)) {
    return {
      success: false,
      error:
        "This booking is older than 48 hours — ask a manager to update it manually",
    };
  }

  const result = await unmarkNoShow(bookingId, current.staff.id);
  if (result.success) {
    revalidatePath("/calendar");
    revalidatePath("/floor");
    if (detail.booking.member_id) {
      revalidatePath(`/members/${detail.booking.member_id}`);
    }
  }
  return result;
}

export interface NoShowStats {
  count: number;
  recentNoShows: Booking[];
}

export async function getNoShowStatsAction(
  memberId: string
): Promise<{ stats?: NoShowStats; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { error: "Not signed in" };

  const [count, recentNoShows] = await Promise.all([
    getNoShowCountForMember(memberId),
    getNoShowHistoryForMember(memberId),
  ]);
  return { stats: { count, recentNoShows } };
}
