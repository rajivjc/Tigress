"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data/staff";
import { writeScheduleAuditLog } from "../audit";
import {
  clearAvailability,
  replaceAvailability,
  type AvailabilityBlockInput,
} from "../data/availability";
import { weekStartFor } from "../lib/materialize";

const PT_DEADLINE_DAY = 4; // Friday (Mon=0..Sun=6)
const PT_DEADLINE_HOUR = 18;

/**
 * Returns true when the *current moment* is past the venue's PT availability
 * deadline for the supplied target week. Default deadline = Friday 18:00 of
 * the *previous* week. Late submissions still go through; the action layer
 * audit-flags them.
 */
function isPastDeadline(weekStartDate: string): boolean {
  // Deadline is Friday of the week before — so seven days before the
  // following week's Monday, plus 4 days for Friday.
  const [y, m, d] = weekStartDate.split("-").map(Number);
  const deadlineMs =
    Date.UTC(y, m - 1, d) -
    24 * 60 * 60 * 1000 * (7 - PT_DEADLINE_DAY) +
    PT_DEADLINE_HOUR * 60 * 60 * 1000;
  // Singapore is UTC+8; treat the deadline as SGT.
  const sgtAdjusted = deadlineMs - 8 * 60 * 60 * 1000;
  return Date.now() > sgtAdjusted;
}

export interface SubmitAvailabilityInput {
  weekStartDate: string;
  blocks: AvailabilityBlockInput[];
}

export async function submitAvailabilityAction(
  input: SubmitAvailabilityInput
): Promise<{ success: boolean; error?: string; flaggedLate?: boolean }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };

  // Normalise the week_start_date to Monday so a typo can't land an
  // arbitrary date in the unique constraint.
  const ws = weekStartFor(input.weekStartDate);

  const result = await replaceAvailability(current.staff.id, ws, input.blocks);
  if (!result.success) return result;

  const late = isPastDeadline(ws);
  await writeScheduleAuditLog(
    late ? "schedule.availability.late_submitted" : "schedule.availability.submitted",
    current.staff.id,
    current.staff.id,
    { week_start_date: ws, blocks_count: input.blocks.length }
  );

  revalidatePath("/staff/availability");
  return { success: true, flaggedLate: late };
}

export async function clearAvailabilityAction(
  weekStartDate: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  const ws = weekStartFor(weekStartDate);
  const result = await clearAvailability(current.staff.id, ws);
  if (result.success) {
    revalidatePath("/staff/availability");
  }
  return result;
}
