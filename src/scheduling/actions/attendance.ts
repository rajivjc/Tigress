"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data/staff";
import { sendPushToStaff } from "@/lib/push/send";
import { writeScheduleAuditLog } from "../audit";
import {
  clearAttendance,
  setAttendance,
} from "../data/attendance";
import { getShift } from "../data/weeks";

function isManager(role: string): boolean {
  return role === "manager" || role === "owner";
}

export async function markNoShowAction(input: {
  shiftId: string;
  note?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const shift = await getShift(input.shiftId);
  if (!shift) return { success: false, error: "Shift not found" };

  const result = await setAttendance({
    shiftId: input.shiftId,
    status: "no_show",
    markedBy: current.staff.id,
    note: input.note ?? null,
  });
  if (!result.success) return { success: false, error: result.error };

  await writeScheduleAuditLog(
    "schedule.shift.no_show",
    input.shiftId,
    current.staff.id,
    { note: input.note ?? null }
  );
  if (shift.user_id) {
    await sendPushToStaff(shift.user_id, {
      title: "No-show flagged",
      body: `Your shift on ${shift.shift_date} was flagged as a no-show`,
      url: "/staff/clock",
      tag: `attendance-${input.shiftId}-no_show`,
    });
  }

  revalidatePath("/manager/scheduling/clock-review");
  revalidatePath("/staff/clock");
  return { success: true };
}

export async function markExcusedAction(input: {
  shiftId: string;
  note: string;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  if (!input.note.trim()) {
    return { success: false, error: "Excused absence requires a note" };
  }

  const result = await setAttendance({
    shiftId: input.shiftId,
    status: "excused",
    markedBy: current.staff.id,
    note: input.note,
  });
  if (!result.success) return { success: false, error: result.error };

  await writeScheduleAuditLog(
    "schedule.shift.excused",
    input.shiftId,
    current.staff.id,
    { note: input.note }
  );
  revalidatePath("/manager/scheduling/clock-review");
  return { success: true };
}

export async function clearAttendanceFlagAction(
  shiftId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await clearAttendance(shiftId);
  if (!result.success) return { success: false, error: result.error };

  await writeScheduleAuditLog(
    "schedule.shift.attendance_cleared",
    shiftId,
    current.staff.id,
    {}
  );
  revalidatePath("/manager/scheduling/clock-review");
  return { success: true };
}
