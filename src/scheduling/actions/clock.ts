"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff, listAllStaff } from "@/lib/data/staff";
import { sendPushToStaff, sendPushToStaffMembers } from "@/lib/push/send";
import { todaySGT } from "@/lib/timezone";
import { writeScheduleAuditLog } from "../audit";
import {
  clockIn,
  clockOut,
  createClockRecordAsManager,
  getClockRecord,
  getClockRecordForShift,
  lockClockRecords,
  managerEditClockRecord,
  unlockClockRecord,
} from "../data/clock-records";
import {
  createCorrection,
  getCorrection,
  setCorrectionStatus,
} from "../data/clock-corrections";
import { getShift, getWeek } from "../data/weeks";

function isManager(role: string): boolean {
  return role === "manager" || role === "owner";
}

// =============================================================================
// Clock-in / Clock-out
// =============================================================================

export async function clockInAction(
  shiftId: string
): Promise<{ success: boolean; recordId?: string; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };

  const shift = await getShift(shiftId);
  if (!shift) return { success: false, error: "Shift not found" };
  if (shift.user_id !== current.staff.id) {
    return { success: false, error: "This shift is not assigned to you" };
  }
  if (shift.shift_date !== todaySGT()) {
    return { success: false, error: "Shift is not scheduled for today" };
  }

  const week = await getWeek(shift.week_id);
  if (!week || week.status !== "published") {
    return { success: false, error: "Shift is not in a published week" };
  }

  const result = await clockIn({ shiftId, userId: current.staff.id });
  if (!result.success || !result.record) {
    return { success: false, error: result.error };
  }

  await writeScheduleAuditLog(
    "schedule.clock.in",
    result.record.id,
    current.staff.id,
    { shift_id: shiftId, clocked_in_at: result.record.clocked_in_at }
  );
  revalidatePath("/staff/clock");
  return { success: true, recordId: result.record.id };
}

export async function clockOutAction(
  recordId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };

  const existing = await getClockRecord(recordId);
  if (!existing) return { success: false, error: "Clock record not found" };
  if (existing.user_id !== current.staff.id && !isManager(current.role)) {
    return { success: false, error: "Cannot clock out another user" };
  }

  const result = await clockOut(recordId);
  if (!result.success || !result.record) {
    return { success: false, error: result.error };
  }
  await writeScheduleAuditLog(
    "schedule.clock.out",
    recordId,
    current.staff.id,
    { clocked_out_at: result.record.clocked_out_at }
  );
  revalidatePath("/staff/clock");
  return { success: true };
}

// Convenience overload — staff hit the button on the shift card. We resolve
// the active clock record for that shift before flipping the status.
export async function clockOutForShiftAction(
  shiftId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  const record = await getClockRecordForShift(shiftId, current.staff.id);
  if (!record) return { success: false, error: "Not currently clocked in" };
  return clockOutAction(record.id);
}

// =============================================================================
// Correction requests
// =============================================================================

export interface RequestClockCorrectionInput {
  clockRecordId: string;
  proposedClockedInAt?: string | null;
  proposedClockedOutAt?: string | null;
  reason: string;
}

export async function requestClockCorrectionAction(
  input: RequestClockCorrectionInput
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };

  const record = await getClockRecord(input.clockRecordId);
  if (!record) return { success: false, error: "Clock record not found" };
  if (record.user_id !== current.staff.id) {
    return { success: false, error: "Cannot request a correction on another user's record" };
  }
  // S26 Medium 4 fix: corrections only make sense after clock-out. An
  // active record means the staff is still on shift — they can just clock
  // out normally, no correction request needed.
  if (record.status === "active") {
    return {
      success: false,
      error: "Clock out before requesting a correction",
    };
  }

  const result = await createCorrection({
    clockRecordId: input.clockRecordId,
    requestedBy: current.staff.id,
    proposedClockedInAt: input.proposedClockedInAt ?? null,
    proposedClockedOutAt: input.proposedClockedOutAt ?? null,
    reason: input.reason,
  });
  if (!result.success || !result.correction) {
    return { success: false, error: result.error };
  }
  await writeScheduleAuditLog(
    "schedule.clock.correction_requested",
    result.correction.id,
    current.staff.id,
    {
      clock_record_id: input.clockRecordId,
      proposed_in: input.proposedClockedInAt ?? null,
      proposed_out: input.proposedClockedOutAt ?? null,
    }
  );

  // Notify all managers/owners that there's a new correction to review.
  const allStaff = await listAllStaff();
  const managers = allStaff
    .filter((s) => s.role === "manager" || s.role === "owner")
    .map((s) => s.id);
  await sendPushToStaffMembers(managers, {
    title: "Clock correction request",
    body: `${current.staff.full_name} requested an edit`,
    url: "/manager/scheduling/clock-review",
    tag: `correction-${result.correction.id}`,
  });

  revalidatePath("/staff/clock");
  revalidatePath("/manager/scheduling/clock-review");
  return { success: true };
}

export interface ResolveCorrectionInput {
  correctionId: string;
  decision: "approve" | "deny";
  note?: string | null;
}

export async function resolveClockCorrectionAction(
  input: ResolveCorrectionInput
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const correction = await getCorrection(input.correctionId);
  if (!correction) return { success: false, error: "Correction not found" };

  const newStatus = input.decision === "approve" ? "approved" : "denied";
  const setStatus = await setCorrectionStatus(
    input.correctionId,
    newStatus,
    current.staff.id,
    input.note ?? null
  );
  if (!setStatus.success || !setStatus.correction) {
    return { success: false, error: setStatus.error };
  }

  if (input.decision === "approve") {
    const record = await getClockRecord(correction.clock_record_id);
    if (record) {
      await managerEditClockRecord({
        recordId: record.id,
        clockedInAt:
          correction.proposed_clocked_in_at ?? record.clocked_in_at,
        clockedOutAt:
          correction.proposed_clocked_out_at ?? record.clocked_out_at ?? "",
        note: `Correction approved: ${correction.reason}`,
      });
    }
  }

  await writeScheduleAuditLog(
    input.decision === "approve"
      ? "schedule.clock.correction_approved"
      : "schedule.clock.correction_denied",
    input.correctionId,
    current.staff.id,
    { resolution_note: input.note ?? null }
  );
  await sendPushToStaff(correction.requested_by, {
    title:
      input.decision === "approve"
        ? "Correction approved"
        : "Correction denied",
    body: input.note?.trim() || "See your clock history.",
    url: "/staff/clock",
    tag: `correction-${correction.id}-resolved`,
  });

  revalidatePath("/staff/clock");
  revalidatePath("/manager/scheduling/clock-review");
  return { success: true };
}

// =============================================================================
// Manager direct edits + lock
// =============================================================================

export interface EditClockRecordInput {
  clockRecordId: string;
  clockedInAt: string;
  clockedOutAt: string;
  note: string;
}

export async function editClockRecordAction(
  input: EditClockRecordInput
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  if (!input.note.trim()) {
    return { success: false, error: "Edit note is required" };
  }

  const result = await managerEditClockRecord({
    recordId: input.clockRecordId,
    clockedInAt: input.clockedInAt,
    clockedOutAt: input.clockedOutAt,
    note: input.note,
  });
  if (!result.success) return { success: false, error: result.error };

  await writeScheduleAuditLog(
    "schedule.clock.edited",
    input.clockRecordId,
    current.staff.id,
    { note: input.note }
  );
  revalidatePath("/manager/scheduling/clock-review");
  return { success: true };
}

export async function lockClockRecordsAction(
  recordIds: string[]
): Promise<{ success: boolean; locked?: number; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await lockClockRecords(recordIds, current.staff.id);
  if (!result.success) return { success: false, error: result.error };

  // One audit row per locked record so the trail is complete.
  await Promise.all(
    recordIds.map((id) =>
      writeScheduleAuditLog(
        "schedule.clock.locked",
        id,
        current.staff.id,
        {}
      )
    )
  );
  revalidatePath("/manager/scheduling/clock-review");
  return { success: true, locked: result.locked };
}

/**
 * S26 Medium 5 fix: manager creates a clock record for a past shift where
 * the staff member forgot to clock in. Validates that:
 *   * the shift exists and is in a non-future date
 *   * the user is the shift's assignee
 *   * no clock record already exists for this (shift, user)
 * Created in pending_review with manager_edited=true and the note.
 */
export interface CreateClockRecordAsManagerInput {
  shiftId: string;
  userId: string;
  clockedInAt: string;
  clockedOutAt: string;
  note: string;
}

export async function createClockRecordAsManagerAction(
  input: CreateClockRecordAsManagerInput
): Promise<{ success: boolean; recordId?: string; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  if (!input.note.trim()) {
    return { success: false, error: "Note is required" };
  }

  const { getShift } = await import("../data/weeks");
  const shift = await getShift(input.shiftId);
  if (!shift) return { success: false, error: "Shift not found" };
  if (shift.user_id !== input.userId) {
    return {
      success: false,
      error: "User is not the assignee of this shift",
    };
  }

  const result = await createClockRecordAsManager({
    shiftId: input.shiftId,
    userId: input.userId,
    clockedInAt: input.clockedInAt,
    clockedOutAt: input.clockedOutAt,
    note: input.note,
  });
  if (!result.success || !result.record) {
    return { success: false, error: result.error };
  }

  await writeScheduleAuditLog(
    "schedule.clock.created_by_manager",
    result.record.id,
    current.staff.id,
    {
      shift_id: input.shiftId,
      user_id: input.userId,
      clocked_in_at: input.clockedInAt,
      clocked_out_at: input.clockedOutAt,
      note: input.note,
    }
  );
  revalidatePath("/manager/scheduling/clock-review");
  return { success: true, recordId: result.record.id };
}

export async function unlockClockRecordAction(input: {
  clockRecordId: string;
  note: string;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  if (!input.note.trim()) {
    return { success: false, error: "Unlock note is required" };
  }

  const record = await getClockRecord(input.clockRecordId);
  if (!record) return { success: false, error: "Clock record not found" };

  const result = await unlockClockRecord(input.clockRecordId, input.note);
  if (!result.success) return { success: false, error: result.error };

  await writeScheduleAuditLog(
    "schedule.clock.unlocked",
    input.clockRecordId,
    current.staff.id,
    { note: input.note }
  );
  await sendPushToStaff(record.user_id, {
    title: "Hours unlocked",
    body: input.note,
    url: "/staff/clock",
    tag: `clock-unlock-${input.clockRecordId}`,
  });

  revalidatePath("/manager/scheduling/clock-review");
  revalidatePath("/staff/clock");
  return { success: true };
}
