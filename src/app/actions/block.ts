"use server";

import { revalidatePath } from "next/cache";
import {
  createBlock,
  deleteActiveBlockForTable,
  deleteBlock,
  type CreateBlockInput,
} from "@/lib/data/blocks";
import { getCurrentStaff } from "@/lib/data/staff";

export interface CreateBlockActionInput {
  table_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  notes?: string | null;
}

export interface CreateBlockActionResult {
  success: boolean;
  blockId?: string;
  error?: string;
}

/**
 * Creates a new blocked_slots row. Manager / owner only.
 */
export async function createBlockAction(
  input: CreateBlockActionInput
): Promise<CreateBlockActionResult> {
  const current = await getCurrentStaff();
  if (!current) {
    return { success: false, error: "Not signed in" };
  }
  if (current.role !== "manager" && current.role !== "owner") {
    return { success: false, error: "Only managers or owners can block tables" };
  }

  const payload: CreateBlockInput = {
    table_id: input.table_id,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    reason: input.reason,
    notes: input.notes ?? null,
    created_by: current.staff.id,
  };

  const result = await createBlock(payload);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  revalidatePath("/floor");
  revalidatePath("/calendar");
  return { success: true, blockId: result.block_id };
}

/**
 * Deletes a blocked_slots row by id. Manager / owner only.
 */
export async function unblockSlotAction(
  blockId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) {
    return { success: false, error: "Not signed in" };
  }
  if (current.role !== "manager" && current.role !== "owner") {
    return { success: false, error: "Only managers or owners can unblock tables" };
  }
  const result = await deleteBlock(blockId);
  if (result.success) {
    revalidatePath("/floor");
    revalidatePath("/calendar");
  }
  return result;
}

/**
 * Removes whichever blocked_slot is currently active for a table. Used by
 * the staff floor view's "Unblock" button, which doesn't know the block id.
 */
export async function unblockSlotForTableAction(
  tableId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) {
    return { success: false, error: "Not signed in" };
  }
  if (current.role !== "manager" && current.role !== "owner") {
    return { success: false, error: "Only managers or owners can unblock tables" };
  }
  const result = await deleteActiveBlockForTable(tableId);
  if (result.success) {
    revalidatePath("/floor");
    revalidatePath("/calendar");
  }
  return result;
}
