"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data/staff";
import { writeScheduleAuditLog } from "../audit";
import { setUserQualifications } from "../data/qualifications";
import type { Qualification } from "../types";

export async function setUserQualificationsAction(
  userId: string,
  qualifications: Qualification[]
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (current.role !== "manager" && current.role !== "owner") {
    return { success: false, error: "Manager or owner role required" };
  }
  const result = await setUserQualifications(userId, qualifications);
  if (result.success) {
    revalidatePath("/manager/users");
    revalidatePath("/manager/scheduling");
    await writeScheduleAuditLog(
      "schedule.qualifications.updated",
      userId,
      current.staff.id,
      { qualifications }
    );
  }
  return result;
}
