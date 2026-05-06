"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data/staff";
import { writeScheduleAuditLog } from "../audit";
import {
  endFtAssignment,
  upsertFtAssignment,
  type UpsertFtAssignmentInput,
} from "../data/ft-assignments";

function isManager(role: string): boolean {
  return role === "manager" || role === "owner";
}

export async function upsertFtAssignmentAction(
  input: UpsertFtAssignmentInput
): Promise<{ success: boolean; assignmentId?: string; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const result = await upsertFtAssignment(input);
  if (result.success) {
    revalidatePath("/manager/users");
    revalidatePath("/manager/scheduling");
    await writeScheduleAuditLog(
      "schedule.ft_assignment.created",
      result.assignmentId ?? null,
      current.staff.id,
      { ...input }
    );
  }
  return result;
}

export async function endFtAssignmentAction(
  assignmentId: string,
  effectiveUntil: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const result = await endFtAssignment(assignmentId, effectiveUntil);
  if (result.success) {
    revalidatePath("/manager/users");
    revalidatePath("/manager/scheduling");
    await writeScheduleAuditLog(
      "schedule.ft_assignment.ended",
      assignmentId,
      current.staff.id,
      { effective_until: effectiveUntil }
    );
  }
  return result;
}
