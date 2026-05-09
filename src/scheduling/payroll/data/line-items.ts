// =============================================================================
// Payroll — line items data layer (Session 27a)
// =============================================================================
// Source-of-truth for the run's totals. Recompute deletes all source='engine'
// rows and re-inserts; manual rows survive.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_PAYROLL_LINE_ITEMS, MOCK_PAYROLL_RUNS } from "./mock-data";
import type {
  PayrollLineItem,
  PayrollLineItemKind,
  PayrollLineItemSource,
} from "../types";

const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

export async function listLineItemsForRun(
  runId: string
): Promise<PayrollLineItem[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_PAYROLL_LINE_ITEMS.filter((i) => i.run_id === runId).slice();
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_payroll_line_items")
    .select("*")
    .eq("run_id", runId);
  return (data as PayrollLineItem[] | null) ?? [];
}

export async function getLineItem(
  itemId: string
): Promise<PayrollLineItem | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_PAYROLL_LINE_ITEMS.find((i) => i.id === itemId) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_payroll_line_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  return (data as PayrollLineItem | null) ?? null;
}

export interface AddLineItemInput {
  runId: string;
  staffId: string;
  kind: PayrollLineItemKind;
  label: string;
  amount: number;
  hours?: number | null;
  rateApplied?: number | null;
  multipliers?: Record<string, number> | null;
  source: PayrollLineItemSource;
  clockRecordId?: string | null;
  notes?: string | null;
}

export async function addLineItem(
  input: AddLineItemInput
): Promise<{ success: boolean; item?: PayrollLineItem; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row: PayrollLineItem = {
      id: id("payroll-li"),
      run_id: input.runId,
      staff_id: input.staffId,
      kind: input.kind,
      label: input.label,
      amount: input.amount,
      hours: input.hours ?? null,
      rate_applied: input.rateApplied ?? null,
      multipliers: input.multipliers ?? null,
      source: input.source,
      clock_record_id: input.clockRecordId ?? null,
      notes: input.notes ?? null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    MOCK_PAYROLL_LINE_ITEMS.push(row);
    return { success: true, item: row };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_payroll_line_items")
    .insert({
      run_id: input.runId,
      staff_id: input.staffId,
      kind: input.kind,
      label: input.label,
      amount: input.amount,
      hours: input.hours ?? null,
      rate_applied: input.rateApplied ?? null,
      multipliers: input.multipliers ?? null,
      source: input.source,
      clock_record_id: input.clockRecordId ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error || !data) return { success: false, error: error?.message };
  return { success: true, item: data as PayrollLineItem };
}

export interface UpdateLineItemInput {
  id: string;
  label?: string;
  amount?: number;
  notes?: string | null;
}

export async function updateLineItem(
  input: UpdateLineItemInput
): Promise<{ success: boolean; item?: PayrollLineItem; error?: string }> {
  const patch: Partial<PayrollLineItem> = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.notes !== undefined) patch.notes = input.notes;

  if (!isSupabaseConfigured()) {
    const row = MOCK_PAYROLL_LINE_ITEMS.find((i) => i.id === input.id);
    if (!row) return { success: false, error: "Line item not found" };
    Object.assign(row, patch);
    row.updated_at = nowIso();
    return { success: true, item: row };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_payroll_line_items")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error || !data) return { success: false, error: error?.message };
  return { success: true, item: data as PayrollLineItem };
}

export async function deleteLineItem(
  itemId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_PAYROLL_LINE_ITEMS.findIndex((i) => i.id === itemId);
    if (idx < 0) return { success: false, error: "Line item not found" };
    MOCK_PAYROLL_LINE_ITEMS.splice(idx, 1);
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_payroll_line_items")
    .delete()
    .eq("id", itemId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Atomic recompute: deletes all engine items for the run, inserts the new
 * batch. Manual items are preserved.
 *
 * Real mode delegates to the schedule_payroll_recompute_run RPC. Mock mode
 * mirrors the same operation in-memory with throw-rollback.
 */
export async function recomputeEngineItems(
  runId: string,
  newEngineDrafts: Array<Omit<PayrollLineItem, "id" | "created_at" | "updated_at">>
): Promise<{ success: boolean; error?: string; inserted?: number }> {
  if (!isSupabaseConfigured()) {
    const run = MOCK_PAYROLL_RUNS.find((r) => r.id === runId);
    if (!run) return { success: false, error: "Run not found" };
    if (run.status !== "draft") {
      return { success: false, error: "Recompute requires draft status" };
    }
    // Snapshot for throw-rollback.
    const beforeItems = MOCK_PAYROLL_LINE_ITEMS.slice();
    try {
      // Remove engine items.
      for (let i = MOCK_PAYROLL_LINE_ITEMS.length - 1; i >= 0; i--) {
        if (
          MOCK_PAYROLL_LINE_ITEMS[i].run_id === runId &&
          MOCK_PAYROLL_LINE_ITEMS[i].source === "engine"
        ) {
          MOCK_PAYROLL_LINE_ITEMS.splice(i, 1);
        }
      }
      // Insert new engine items.
      for (const draft of newEngineDrafts) {
        const row: PayrollLineItem = {
          id: id("payroll-li"),
          ...draft,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        MOCK_PAYROLL_LINE_ITEMS.push(row);
      }
      run.last_computed_at = nowIso();
      run.updated_at = nowIso();
      return { success: true, inserted: newEngineDrafts.length };
    } catch (err) {
      // Rollback.
      MOCK_PAYROLL_LINE_ITEMS.length = 0;
      MOCK_PAYROLL_LINE_ITEMS.push(...beforeItems);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Recompute failed",
      };
    }
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("schedule_payroll_recompute_run", {
    p_run_id: runId,
    p_engine_items: newEngineDrafts.map((d) => ({
      staff_id: d.staff_id,
      kind: d.kind,
      label: d.label,
      amount: d.amount,
      hours: d.hours,
      rate_applied: d.rate_applied,
      multipliers: d.multipliers,
      clock_record_id: d.clock_record_id,
      notes: d.notes,
    })),
  });
  if (error) return { success: false, error: error.message };
  return { success: true, inserted: newEngineDrafts.length };
}
