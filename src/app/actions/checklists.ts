"use server";

import { revalidatePath } from "next/cache";
import {
  createChecklistTemplate,
  deleteChecklistTemplate,
  getChecklistHistory,
  getChecklistInstanceItems,
  getChecklistsForDate,
  toggleChecklistItem,
  updateChecklistTemplate,
  updateChecklistTemplateItems,
  type ChecklistHistoryParams,
  type CreateChecklistTemplateInput,
  type TemplateItemInput,
  type ToggleResult,
  type UpdateChecklistTemplateInput,
} from "@/lib/data/checklists";
import { getCurrentStaff } from "@/lib/data/staff";
import { todaySGT } from "@/lib/timezone";
import type {
  ChecklistInstanceItem,
  ChecklistInstanceSummary,
  ChecklistInstanceWithItems,
} from "@/lib/types/checklists";

function isManagerOrOwner(role: string): boolean {
  return role === "manager" || role === "owner";
}

// =============================================================================
// Template actions (manager/owner)
// =============================================================================

export interface CreateChecklistTemplateActionInput {
  name: string;
  description?: string | null;
  category: "daily" | "weekly" | "ad_hoc";
  items: { label: string; description?: string | null }[];
}

export async function createChecklistTemplateAction(
  input: CreateChecklistTemplateActionInput
): Promise<{ success: boolean; templateId?: string; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManagerOrOwner(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  if (!input.name.trim()) {
    return { success: false, error: "Name is required" };
  }

  const payload: CreateChecklistTemplateInput = {
    name: input.name,
    description: input.description,
    category: input.category,
    items: (input.items ?? []).filter((i) => i.label.trim().length > 0),
    createdBy: current.staff.id,
  };

  const result = await createChecklistTemplate(payload);
  if (result.success) {
    revalidatePath("/checklists");
    revalidatePath("/checklists/templates");
  }
  return result;
}

export async function updateChecklistTemplateAction(
  templateId: string,
  input: UpdateChecklistTemplateInput
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManagerOrOwner(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await updateChecklistTemplate(templateId, input);
  if (result.success) {
    revalidatePath("/checklists");
    revalidatePath("/checklists/templates");
    revalidatePath(`/checklists/templates/${templateId}`);
  }
  return result;
}

export async function updateChecklistTemplateItemsAction(
  templateId: string,
  items: TemplateItemInput[]
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManagerOrOwner(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const cleaned = items
    .filter((i) => i.label.trim().length > 0)
    .map((i, idx) => ({ ...i, sort_order: idx + 1 }));

  const result = await updateChecklistTemplateItems(templateId, cleaned);
  if (result.success) {
    revalidatePath("/checklists");
    revalidatePath("/checklists/templates");
    revalidatePath(`/checklists/templates/${templateId}`);
  }
  return result;
}

export async function deleteChecklistTemplateAction(
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManagerOrOwner(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await deleteChecklistTemplate(templateId);
  if (result.success) {
    revalidatePath("/checklists");
    revalidatePath("/checklists/templates");
  }
  return result;
}

// =============================================================================
// Instance actions (staff+)
// =============================================================================

export async function getChecklistsForDateAction(
  date?: string
): Promise<{ checklists?: ChecklistInstanceWithItems[]; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { error: "Not signed in" };

  try {
    const checklists = await getChecklistsForDate(date ?? todaySGT());
    return { checklists };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to load checklists",
    };
  }
}

export async function toggleChecklistItemAction(
  itemId: string
): Promise<ToggleResult> {
  const current = await getCurrentStaff();
  if (!current) {
    return {
      success: false,
      checked: false,
      allComplete: false,
      error: "Not signed in",
    };
  }

  const result = await toggleChecklistItem(itemId, current.staff.id);
  if (result.success) {
    revalidatePath("/checklists");
  }
  return result;
}

// =============================================================================
// History (manager/owner)
// =============================================================================

export async function getChecklistHistoryAction(
  params: ChecklistHistoryParams
): Promise<{ history?: ChecklistInstanceSummary[]; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { error: "Not signed in" };
  if (!isManagerOrOwner(current.role)) {
    return { error: "Manager or owner role required" };
  }

  try {
    const history = await getChecklistHistory(params);
    return { history };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to load history",
    };
  }
}

export async function getChecklistInstanceItemsAction(
  instanceId: string
): Promise<{ items?: ChecklistInstanceItem[]; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { error: "Not signed in" };
  if (!isManagerOrOwner(current.role)) {
    return { error: "Manager or owner role required" };
  }
  try {
    const items = await getChecklistInstanceItems(instanceId);
    return { items };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to load items",
    };
  }
}
