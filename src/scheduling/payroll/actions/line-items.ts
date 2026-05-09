"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data/staff";
import { writePayrollAuditLog } from "../audit";
import {
  addLineItem,
  deleteLineItem,
  getLineItem,
  updateLineItem,
} from "../data/line-items";
import { getRun } from "../data/runs";
import type { PayrollLineItemKind } from "../types";

function isManager(role: string): boolean {
  return role === "manager" || role === "owner";
}

const MANUAL_KINDS: PayrollLineItemKind[] = [
  "allowance",
  "tip",
  "bonus",
  "deduction",
  "other",
];

export async function addLineItemAction(input: {
  runId: string;
  staffId: string;
  kind: PayrollLineItemKind;
  label: string;
  amount: number;
  notes?: string | null;
}): Promise<{ success: boolean; itemId?: string; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  if (!MANUAL_KINDS.includes(input.kind)) {
    return { success: false, error: "Only manual kinds can be added directly" };
  }
  if (!input.label.trim()) {
    return { success: false, error: "Label is required" };
  }

  const run = await getRun(input.runId);
  if (!run) return { success: false, error: "Run not found" };
  if (run.status !== "draft") {
    return { success: false, error: "Run must be in draft to edit items" };
  }

  const result = await addLineItem({
    runId: input.runId,
    staffId: input.staffId,
    kind: input.kind,
    label: input.label,
    amount: input.amount,
    source: "manual",
    notes: input.notes ?? null,
  });
  if (!result.success || !result.item) {
    return { success: false, error: result.error };
  }

  await writePayrollAuditLog(
    "payroll.line_item.added",
    result.item.id,
    current.staff.id,
    {
      run_id: input.runId,
      staff_id: input.staffId,
      kind: input.kind,
      amount: input.amount,
    }
  );
  revalidatePath(`/manager/payroll/runs/${input.runId}`);
  return { success: true, itemId: result.item.id };
}

export async function updateLineItemAction(input: {
  id: string;
  label?: string;
  amount?: number;
  notes?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const existing = await getLineItem(input.id);
  if (!existing) return { success: false, error: "Line item not found" };
  if (existing.source !== "manual") {
    return { success: false, error: "Only manual items can be edited" };
  }

  const run = await getRun(existing.run_id);
  if (!run) return { success: false, error: "Run not found" };
  if (run.status !== "draft") {
    return { success: false, error: "Run must be in draft to edit items" };
  }

  const result = await updateLineItem(input);
  if (!result.success) return { success: false, error: result.error };

  await writePayrollAuditLog(
    "payroll.line_item.updated",
    input.id,
    current.staff.id,
    { run_id: existing.run_id }
  );
  revalidatePath(`/manager/payroll/runs/${existing.run_id}`);
  return { success: true };
}

export async function deleteLineItemAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const existing = await getLineItem(id);
  if (!existing) return { success: false, error: "Line item not found" };
  if (existing.source !== "manual") {
    return { success: false, error: "Only manual items can be deleted" };
  }

  const run = await getRun(existing.run_id);
  if (!run) return { success: false, error: "Run not found" };
  if (run.status !== "draft") {
    return { success: false, error: "Run must be in draft to edit items" };
  }

  const result = await deleteLineItem(id);
  if (!result.success) return { success: false, error: result.error };

  await writePayrollAuditLog(
    "payroll.line_item.deleted",
    id,
    current.staff.id,
    { run_id: existing.run_id }
  );
  revalidatePath(`/manager/payroll/runs/${existing.run_id}`);
  return { success: true };
}
