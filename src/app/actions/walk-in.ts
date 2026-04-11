"use server";

import { revalidatePath } from "next/cache";
import { createWalkIn, type CreateWalkInInput } from "@/lib/data/bookings";
import { getCurrentStaff } from "@/lib/data/staff";

export interface CreateWalkInActionInput {
  table_id: string;
  starts_at: string;
  ends_at: string;
  guest_name: string;
  guest_phone?: string | null;
  guest_count: number;
  comments?: string | null;
  deposit_required: boolean;
  deposit_paid: boolean;
}

export interface CreateWalkInActionResult {
  success: boolean;
  bookingId?: string;
  error?: string;
}

export async function createWalkInAction(
  input: CreateWalkInActionInput
): Promise<CreateWalkInActionResult> {
  const current = await getCurrentStaff();
  if (!current) {
    return { success: false, error: "Not signed in" };
  }
  // Any staff role can record a walk-in.
  const payload: CreateWalkInInput = {
    ...input,
    created_by: current.staff.id,
  };

  const result = await createWalkIn(payload);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  revalidatePath("/floor");
  revalidatePath("/calendar");
  revalidatePath("/walk-in");
  return { success: true, bookingId: result.booking_id };
}
