"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff, listAllStaff } from "@/lib/data/staff";
import { sendPushToStaff } from "@/lib/push/send";
import { writeScheduleAuditLog } from "../audit";
import {
  acceptChangeRequest,
  createChangeRequest,
  getChangeRequest,
  setChangeRequestStatus,
} from "../data/shift-change-requests";
import {
  getShift,
  listSameDayShiftsForUser,
  setShiftUser,
} from "../data/weeks";
import { listAllQualifications } from "../data/qualifications";
import { listFtAssignments } from "../data/ft-assignments";
import { getAvailabilityForUser } from "../data/availability";
import {
  isUserAvailableForShift,
  timeRangesOverlap,
  type EmploymentType,
} from "../lib/availability-check";
import { weekStartFor } from "../lib/materialize";

const SWAP_DEADLINE_MINUTES = 120; // 2 hours before shift start

function isManager(role: string): boolean {
  return role === "manager" || role === "owner";
}

/**
 * Returns the absolute UTC instant of the shift's scheduled start, treating
 * the wall-clock time as Singapore (UTC+8).
 */
function shiftStartMs(date: string, time: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Date.UTC(y, mo - 1, d, hh ?? 0, mm ?? 0) - 8 * 60 * 60 * 1000;
}

function isPastSwapDeadline(date: string, time: string): boolean {
  const startMs = shiftStartMs(date, time);
  return Date.now() > startMs - SWAP_DEADLINE_MINUTES * 60 * 1000;
}

async function checkEligibilityForShift(
  shiftId: string,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const shift = await getShift(shiftId);
  if (!shift) return { ok: false, error: "Shift not found" };

  const [staffList, allQuals, ftAssignments, availability, sameDayShifts] =
    await Promise.all([
      listAllStaff(),
      listAllQualifications(),
      listFtAssignments(),
      getAvailabilityForUser(userId, weekStartFor(shift.shift_date)),
      listSameDayShiftsForUser(userId, shift.shift_date, shiftId),
    ]);

  const staff = staffList.find((s) => s.id === userId);
  if (!staff) return { ok: false, error: "User not found" };

  const userQuals = allQuals
    .filter((q) => q.user_id === userId)
    .map((q) => q.qualification);
  if (!userQuals.includes(shift.role)) {
    return { ok: false, error: `User is not qualified for ${shift.role}` };
  }

  const userFt = ftAssignments.filter((f) => f.user_id === userId);
  const employment: EmploymentType =
    staff.employment_type === "full_time" ? "full_time" : "part_time";

  const availabilityCheck = isUserAvailableForShift({
    user_employment_type: employment,
    shift,
    availabilityBlocks: availability,
    ftAssignments: userFt,
  });
  if (!availabilityCheck.ok) {
    return { ok: false, error: availabilityCheck.reason };
  }

  for (const other of sameDayShifts) {
    if (
      timeRangesOverlap(
        shift.start_time,
        shift.end_time,
        other.start_time,
        other.end_time
      )
    ) {
      return { ok: false, error: "Same-day overlap" };
    }
  }
  return { ok: true };
}

// =============================================================================
// Create requests
// =============================================================================

export async function requestDirectSwapAction(input: {
  shiftId: string;
  targetUserId: string;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };

  const shift = await getShift(input.shiftId);
  if (!shift) return { success: false, error: "Shift not found" };
  if (shift.user_id !== current.staff.id) {
    return { success: false, error: "Cannot swap a shift that is not yours" };
  }
  if (isPastSwapDeadline(shift.shift_date, shift.start_time)) {
    return { success: false, error: "Past the 2-hour swap deadline" };
  }
  const eligibility = await checkEligibilityForShift(
    input.shiftId,
    input.targetUserId
  );
  if (!eligibility.ok) {
    return { success: false, error: eligibility.error };
  }

  const result = await createChangeRequest({
    kind: "direct_swap",
    shiftId: input.shiftId,
    requestedBy: current.staff.id,
    targetUserId: input.targetUserId,
  });
  if (!result.success || !result.request) {
    return { success: false, error: result.error };
  }

  await writeScheduleAuditLog(
    "schedule.swap.requested",
    result.request.id,
    current.staff.id,
    { shift_id: input.shiftId, target_user_id: input.targetUserId }
  );
  await sendPushToStaff(input.targetUserId, {
    title: "Swap request",
    body: `${current.staff.full_name} wants to swap on ${shift.shift_date}`,
    url: "/staff/swaps",
    tag: `swap-${result.request.id}`,
  });
  revalidatePath("/staff/swaps");
  return { success: true };
}

export async function requestGiveawayAction(input: {
  shiftId: string;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };

  const shift = await getShift(input.shiftId);
  if (!shift) return { success: false, error: "Shift not found" };
  if (shift.user_id !== current.staff.id) {
    return { success: false, error: "Cannot give away a shift that is not yours" };
  }
  if (isPastSwapDeadline(shift.shift_date, shift.start_time)) {
    return { success: false, error: "Past the 2-hour swap deadline" };
  }

  const result = await createChangeRequest({
    kind: "giveaway",
    shiftId: input.shiftId,
    requestedBy: current.staff.id,
    targetUserId: null,
  });
  if (!result.success || !result.request) {
    return { success: false, error: result.error };
  }

  await writeScheduleAuditLog(
    "schedule.swap.giveaway_posted",
    result.request.id,
    current.staff.id,
    { shift_id: input.shiftId }
  );
  revalidatePath("/staff/swaps");
  return { success: true };
}

// =============================================================================
// Resolve requests
// =============================================================================

export async function acceptSwapRequestAction(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };

  const request = await getChangeRequest(requestId);
  if (!request) return { success: false, error: "Request not found" };
  if (request.kind !== "direct_swap") {
    return { success: false, error: "Use the giveaway claim flow for giveaways" };
  }
  if (request.target_user_id !== current.staff.id) {
    return { success: false, error: "This swap is not directed at you" };
  }
  const shift = await getShift(request.shift_id);
  if (!shift) return { success: false, error: "Shift not found" };
  if (isPastSwapDeadline(shift.shift_date, shift.start_time)) {
    return { success: false, error: "Past the 2-hour swap deadline" };
  }
  const eligibility = await checkEligibilityForShift(
    request.shift_id,
    current.staff.id
  );
  if (!eligibility.ok) {
    return { success: false, error: eligibility.error };
  }

  const result = await acceptChangeRequest(requestId, current.staff.id);
  if (!result.success) return { success: false, error: result.error };

  await writeScheduleAuditLog(
    "schedule.swap.accepted",
    requestId,
    current.staff.id,
    { shift_id: request.shift_id }
  );
  await sendPushToStaff(request.requested_by, {
    title: "Swap accepted",
    body: `${current.staff.full_name} took your shift on ${shift.shift_date}`,
    url: "/staff/swaps",
    tag: `swap-${requestId}-accepted`,
  });
  revalidatePath("/staff/swaps");
  revalidatePath("/staff/schedule");
  return { success: true };
}

export async function claimGiveawayAction(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };

  const request = await getChangeRequest(requestId);
  if (!request) return { success: false, error: "Request not found" };
  if (request.kind !== "giveaway") {
    return { success: false, error: "Use the direct-swap accept flow" };
  }
  if (request.requested_by === current.staff.id) {
    return { success: false, error: "Cannot claim your own giveaway" };
  }
  const shift = await getShift(request.shift_id);
  if (!shift) return { success: false, error: "Shift not found" };
  if (isPastSwapDeadline(shift.shift_date, shift.start_time)) {
    return { success: false, error: "Past the 2-hour swap deadline" };
  }
  const eligibility = await checkEligibilityForShift(
    request.shift_id,
    current.staff.id
  );
  if (!eligibility.ok) {
    return { success: false, error: eligibility.error };
  }

  const result = await acceptChangeRequest(requestId, current.staff.id);
  if (!result.success) return { success: false, error: result.error };

  await writeScheduleAuditLog(
    "schedule.swap.giveaway_claimed",
    requestId,
    current.staff.id,
    { shift_id: request.shift_id }
  );
  await sendPushToStaff(request.requested_by, {
    title: "Giveaway claimed",
    body: `${current.staff.full_name} claimed your shift on ${shift.shift_date}`,
    url: "/staff/swaps",
    tag: `swap-${requestId}-claimed`,
  });
  revalidatePath("/staff/swaps");
  revalidatePath("/staff/schedule");
  return { success: true };
}

export async function declineSwapRequestAction(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };

  const request = await getChangeRequest(requestId);
  if (!request) return { success: false, error: "Request not found" };
  if (request.kind !== "direct_swap" || request.target_user_id !== current.staff.id) {
    return { success: false, error: "Cannot decline this request" };
  }
  if (request.status !== "pending") {
    return { success: false, error: "Request is not pending" };
  }

  const result = await setChangeRequestStatus(
    requestId,
    "declined",
    current.staff.id,
    null
  );
  if (!result.success) return { success: false, error: result.error };

  await writeScheduleAuditLog(
    "schedule.swap.declined",
    requestId,
    current.staff.id,
    { shift_id: request.shift_id }
  );
  await sendPushToStaff(request.requested_by, {
    title: "Swap declined",
    body: `${current.staff.full_name} declined your swap`,
    url: "/staff/swaps",
    tag: `swap-${requestId}-declined`,
  });
  revalidatePath("/staff/swaps");
  return { success: true };
}

export async function cancelSwapRequestAction(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };

  const request = await getChangeRequest(requestId);
  if (!request) return { success: false, error: "Request not found" };
  if (request.requested_by !== current.staff.id) {
    return { success: false, error: "Only the requester can cancel" };
  }
  if (request.status !== "pending") {
    return { success: false, error: "Request is not pending" };
  }

  const result = await setChangeRequestStatus(
    requestId,
    "cancelled",
    current.staff.id,
    null
  );
  if (!result.success) return { success: false, error: result.error };

  await writeScheduleAuditLog(
    "schedule.swap.cancelled",
    requestId,
    current.staff.id,
    { shift_id: request.shift_id }
  );
  revalidatePath("/staff/swaps");
  return { success: true };
}

export async function reverseSwapAction(input: {
  requestId: string;
  note: string;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  if (!input.note.trim()) {
    return { success: false, error: "Reversal note is required" };
  }

  const request = await getChangeRequest(input.requestId);
  if (!request) return { success: false, error: "Request not found" };
  if (request.status !== "accepted") {
    return { success: false, error: "Only accepted swaps can be reversed" };
  }

  const shift = await getShift(request.shift_id);
  if (!shift) return { success: false, error: "Shift not found" };

  // Within shift window only — reject if the shift has already started.
  if (Date.now() > shiftStartMs(shift.shift_date, shift.start_time)) {
    return { success: false, error: "Shift has already started; cannot reverse" };
  }

  const restore = await setShiftUser(shift.id, request.requested_by);
  if (!restore.success) return { success: false, error: restore.error };

  const result = await setChangeRequestStatus(
    input.requestId,
    "reversed",
    current.staff.id,
    input.note
  );
  if (!result.success) return { success: false, error: result.error };

  await writeScheduleAuditLog(
    "schedule.swap.reversed",
    input.requestId,
    current.staff.id,
    { shift_id: shift.id, note: input.note }
  );
  await Promise.all(
    [request.requested_by, request.accepted_by]
      .filter((id): id is string => Boolean(id))
      .map((userId) =>
        sendPushToStaff(userId, {
          title: "Swap reversed",
          body: input.note,
          url: "/staff/swaps",
          tag: `swap-${input.requestId}-reversed`,
        })
      )
  );

  revalidatePath("/staff/swaps");
  revalidatePath("/staff/schedule");
  revalidatePath("/manager/scheduling/swaps");
  return { success: true };
}
