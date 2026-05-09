"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff, listAllStaff } from "@/lib/data/staff";
import { sendPushToStaff, sendPushToStaffMembers } from "@/lib/push/send";
import { writeScheduleAuditLog } from "../audit";
import {
  addShift,
  archiveWeek,
  copyFromPreviousWeek,
  createWeek,
  getShift,
  getWeek,
  listSameDayShiftsForUser,
  listShiftsForWeek,
  publishWeek,
  removeShift,
  setShiftTimes,
  setShiftUser,
  unpublishWeek,
} from "../data/weeks";
import { listAllQualifications } from "../data/qualifications";
import { listDayCoverage, listShiftTemplates } from "../data/templates";
import { listFtAssignments } from "../data/ft-assignments";
import { getAvailabilityForUser } from "../data/availability";
import { validateWeekCoverage } from "../lib/coverage";
import {
  isUserAvailableForShift,
  timeRangesOverlap,
  type EmploymentType,
} from "../lib/availability-check";
import { addDaysIso, weekStartFor } from "../lib/materialize";
import type { Qualification } from "../types";

function isManager(role: string): boolean {
  return role === "manager" || role === "owner";
}

// =============================================================================
// Week create / copy
// =============================================================================

export async function createWeekAction(
  weekStartDate: string
): Promise<{ success: boolean; weekId?: string; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const ws = weekStartFor(weekStartDate);
  const result = await createWeek(ws);
  if (!result.success || !result.week) {
    return { success: false, error: result.error };
  }
  revalidatePath("/manager/scheduling");
  await writeScheduleAuditLog(
    "schedule.week.created",
    result.week.id,
    current.staff.id,
    { week_start_date: ws }
  );
  return { success: true, weekId: result.week.id };
}

export async function copyFromPreviousWeekAction(
  newWeekStartDate: string
): Promise<{ success: boolean; weekId?: string; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const newWs = weekStartFor(newWeekStartDate);
  const prevWs = addDaysIso(newWs, -7);

  const allQuals = await listAllQualifications();
  const map = new Map<string, Qualification[]>();
  for (const q of allQuals) {
    const existing = map.get(q.user_id) ?? [];
    existing.push(q.qualification);
    map.set(q.user_id, existing);
  }

  const result = await copyFromPreviousWeek(newWs, prevWs, map);
  if (!result.success || !result.week) {
    return { success: false, error: result.error };
  }
  revalidatePath("/manager/scheduling");
  await writeScheduleAuditLog(
    "schedule.week.copied_from",
    result.week.id,
    current.staff.id,
    { previous_week_start_date: prevWs, new_week_start_date: newWs }
  );
  return { success: true, weekId: result.week.id };
}

// =============================================================================
// Shift CRUD
// =============================================================================

export interface AddShiftActionInput {
  weekId: string;
  templateId: string;
  shiftDate: string;
  role: Qualification;
  startTime: string;
  endTime: string;
}

export async function addShiftAction(
  input: AddShiftActionInput
): Promise<{ success: boolean; shiftId?: string; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  return addShift(input);
}

export async function assignUserToShiftAction(
  shiftId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  // Validate eligibility before writing.
  const shift = await getShift(shiftId);
  if (!shift) return { success: false, error: "Shift not found" };

  const [staffList, allQuals, ftAssignments, availability, sameDayShifts] =
    await Promise.all([
      listAllStaff(),
      listAllQualifications(),
      listFtAssignments(),
      getAvailabilityForUser(userId, weekStartFor(shift.shift_date)),
      listSameDayShiftsForUser(userId, shift.shift_date, shiftId),
    ]);

  const staff = staffList.find((s) => s.id === userId);
  if (!staff) return { success: false, error: "User not found" };

  const userQuals = allQuals
    .filter((q) => q.user_id === userId)
    .map((q) => q.qualification);
  if (!userQuals.includes(shift.role)) {
    return {
      success: false,
      error: `User is not qualified for ${shift.role}`,
    };
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
    return { success: false, error: availabilityCheck.reason };
  }

  // Hard block on same-day overlap.
  for (const other of sameDayShifts) {
    if (
      timeRangesOverlap(
        shift.start_time,
        shift.end_time,
        other.start_time,
        other.end_time
      )
    ) {
      return {
        success: false,
        error: "User already has an overlapping shift on this date",
      };
    }
  }

  const result = await setShiftUser(shiftId, userId);
  if (result.success) {
    revalidatePath("/manager/scheduling");
    revalidatePath("/staff/schedule");

    await writeScheduleAuditLog(
      "schedule.shift.assigned",
      shiftId,
      current.staff.id,
      { user_id: userId }
    );

    // If the parent week is published, the user gets a push that they were
    // added mid-week.
    const week = await getWeek(shift.week_id);
    if (week?.status === "published") {
      await sendPushToStaff(userId, {
        title: "New shift assigned",
        body: `${shift.shift_date} ${shift.start_time.slice(0, 5)} (${shift.role})`,
        url: "/staff/schedule",
        tag: `schedule-shift-${shiftId}`,
      });
    }
  }
  return result;
}

export async function unassignUserFromShiftAction(
  shiftId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const shift = await getShift(shiftId);
  if (!shift) return { success: false, error: "Shift not found" };
  const previousUserId = shift.user_id;

  const result = await setShiftUser(shiftId, null);
  if (result.success) {
    revalidatePath("/manager/scheduling");
    revalidatePath("/staff/schedule");

    await writeScheduleAuditLog(
      "schedule.shift.unassigned",
      shiftId,
      current.staff.id,
      { user_id: previousUserId }
    );

    const week = await getWeek(shift.week_id);
    if (week?.status === "published" && previousUserId) {
      await sendPushToStaff(previousUserId, {
        title: "Shift removed",
        body: `Your shift on ${shift.shift_date} has been removed`,
        url: "/staff/schedule",
        tag: `schedule-shift-${shiftId}-unassigned`,
      });
    }
  }
  return result;
}

export async function updateShiftTimeAction(
  shiftId: string,
  startTime: string,
  endTime: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const result = await setShiftTimes(shiftId, startTime, endTime);
  if (result.success) {
    revalidatePath("/manager/scheduling");
    await writeScheduleAuditLog(
      "schedule.shift.time_overridden",
      shiftId,
      current.staff.id,
      { start_time: startTime, end_time: endTime }
    );
  }
  return result;
}

export async function removeShiftAction(
  shiftId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const result = await removeShift(shiftId);
  if (result.success) {
    revalidatePath("/manager/scheduling");
    await writeScheduleAuditLog(
      "schedule.shift.removed",
      shiftId,
      current.staff.id,
      {}
    );
  }
  return result;
}

// =============================================================================
// Publish / Unpublish
// =============================================================================

export interface PublishWeekActionInput {
  weekId: string;
  overrideNote?: string | null;
}

export async function publishWeekAction(
  input: PublishWeekActionInput
): Promise<{
  success: boolean;
  error?: string;
  requiresOverride?: boolean;
  gaps?: ReturnType<typeof validateWeekCoverage>["gaps"];
}> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const [shifts, dayCoverage] = await Promise.all([
    listShiftsForWeek(input.weekId),
    listDayCoverage(),
  ]);

  const report = validateWeekCoverage({ shifts, dayCoverage });
  const overrideNote = input.overrideNote?.trim() || null;

  if (!report.ok && !overrideNote) {
    return {
      success: false,
      requiresOverride: true,
      gaps: report.gaps,
      error: "Coverage gaps require an override note",
    };
  }

  const result = await publishWeek({
    weekId: input.weekId,
    publisherStaffId: current.staff.id,
    overrideNote,
  });
  if (!result.success) return result;

  await writeScheduleAuditLog(
    overrideNote
      ? "schedule.week.published_with_override"
      : "schedule.week.published",
    input.weekId,
    current.staff.id,
    {
      override_note: overrideNote,
      gap_count: report.gaps.length,
    }
  );

  // Notify every assigned user — parallelised to keep publish snappy with
  // many staff. Each push is fire-and-forget already, so Promise.all
  // settles when the slowest finishes rather than serialising them.
  const userIds = Array.from(
    new Set(
      shifts
        .map((s) => s.user_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const counts = new Map<string, number>();
  for (const s of shifts) {
    if (!s.user_id) continue;
    counts.set(s.user_id, (counts.get(s.user_id) ?? 0) + 1);
  }
  await Promise.all(
    userIds.map((userId) => {
      const n = counts.get(userId) ?? 0;
      return sendPushToStaff(userId, {
        title: "Your shifts are up",
        body: `${n} shift${n === 1 ? "" : "s"} this week`,
        url: "/staff/schedule",
        tag: `schedule-week-${input.weekId}`,
      });
    })
  );

  revalidatePath("/manager/scheduling");
  revalidatePath("/staff/schedule");
  return { success: true };
}

export async function unpublishWeekAction(
  weekId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const week = await getWeek(weekId);
  if (!week) return { success: false, error: "Week not found" };

  const shifts = await listShiftsForWeek(weekId);

  const result = await unpublishWeek(weekId);
  if (!result.success) return result;

  await writeScheduleAuditLog(
    "schedule.week.unpublished",
    weekId,
    current.staff.id,
    { week_start_date: week.week_start_date }
  );

  const userIds = Array.from(
    new Set(
      shifts
        .map((s) => s.user_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  await sendPushToStaffMembers(userIds, {
    title: "Schedule revised",
    body: `Schedule for week of ${week.week_start_date} is being revised`,
    url: "/staff/schedule",
    tag: `schedule-week-${weekId}-unpublished`,
  });

  revalidatePath("/manager/scheduling");
  revalidatePath("/staff/schedule");
  return { success: true };
}

export async function archiveWeekAction(
  weekId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const result = await archiveWeek(weekId);
  if (result.success) {
    revalidatePath("/manager/scheduling");
  }
  return result;
}
