"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data/staff";
import { writeScheduleAuditLog } from "../audit";
import {
  deleteShiftTemplate,
  removeTemplateDayCoverage,
  setTemplateDayCoverage,
  upsertShiftTemplate,
  type UpsertTemplateInput,
} from "../data/templates";
import type { Qualification, RoleRequirements } from "../types";

function isManager(role: string): boolean {
  return role === "manager" || role === "owner";
}

export async function upsertShiftTemplateAction(
  input: UpsertTemplateInput
): Promise<{ success: boolean; templateId?: string; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const result = await upsertShiftTemplate(input);
  if (result.success) {
    revalidatePath("/manager/settings/shift-templates");
    revalidatePath("/manager/scheduling");
    await writeScheduleAuditLog(
      input.id ? "schedule.template.updated" : "schedule.template.created",
      result.templateId ?? null,
      current.staff.id,
      { name: input.name }
    );
  }
  return result;
}

export async function deleteShiftTemplateAction(
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const result = await deleteShiftTemplate(templateId);
  if (result.success) {
    revalidatePath("/manager/settings/shift-templates");
    revalidatePath("/manager/scheduling");
    await writeScheduleAuditLog(
      "schedule.template.deleted",
      templateId,
      current.staff.id,
      {}
    );
  }
  return result;
}

export async function setTemplateDayCoverageAction(
  templateId: string,
  dayOfWeek: number,
  roleRequirements: Partial<Record<Qualification, number>>
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const result = await setTemplateDayCoverage(
    templateId,
    dayOfWeek,
    roleRequirements as RoleRequirements
  );
  if (result.success) {
    revalidatePath("/manager/settings/shift-templates");
    revalidatePath("/manager/scheduling");
    await writeScheduleAuditLog(
      "schedule.template_day_coverage.set",
      templateId,
      current.staff.id,
      { day_of_week: dayOfWeek, role_requirements: roleRequirements }
    );
  }
  return result;
}

export async function removeTemplateDayCoverageAction(
  templateId: string,
  dayOfWeek: number
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const result = await removeTemplateDayCoverage(templateId, dayOfWeek);
  if (result.success) {
    revalidatePath("/manager/settings/shift-templates");
    revalidatePath("/manager/scheduling");
    await writeScheduleAuditLog(
      "schedule.template_day_coverage.removed",
      templateId,
      current.staff.id,
      { day_of_week: dayOfWeek }
    );
  }
  return result;
}
