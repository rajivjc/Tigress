// =============================================================================
// Payroll — runs data layer (Session 27a)
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_PAYROLL_LINE_ITEMS,
  MOCK_PAYROLL_RECONCILIATION,
  MOCK_PAYROLL_RUNS,
} from "./mock-data";
import type { PayrollRun, PayrollRunStatus } from "../types";

const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

export async function listRuns(): Promise<PayrollRun[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_PAYROLL_RUNS.slice().sort((a, b) =>
      b.period_start.localeCompare(a.period_start)
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_payroll_runs")
    .select("*")
    .order("period_start", { ascending: false });
  return (data as PayrollRun[] | null) ?? [];
}

export async function getRun(runId: string): Promise<PayrollRun | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_PAYROLL_RUNS.find((r) => r.id === runId) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_payroll_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  return (data as PayrollRun | null) ?? null;
}

export interface CreateRunInput {
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
}

export async function createRun(
  input: CreateRunInput
): Promise<{ success: boolean; run?: PayrollRun; error?: string }> {
  if (input.periodEnd < input.periodStart) {
    return { success: false, error: "period_end must be >= period_start" };
  }
  if (!isSupabaseConfigured()) {
    const overlap = MOCK_PAYROLL_RUNS.find(
      (r) =>
        r.period_start === input.periodStart &&
        r.period_end === input.periodEnd
    );
    if (overlap) {
      return { success: false, error: "A run already exists for this period" };
    }
    const row: PayrollRun = {
      id: id("payroll-run"),
      period_start: input.periodStart,
      period_end: input.periodEnd,
      payment_date: input.paymentDate,
      status: "draft",
      locked_at: null,
      locked_by: null,
      unlock_note: null,
      last_computed_at: null,
      last_exported_at: null,
      last_export_format: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    MOCK_PAYROLL_RUNS.push(row);
    return { success: true, run: row };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_payroll_runs")
    .insert({
      period_start: input.periodStart,
      period_end: input.periodEnd,
      payment_date: input.paymentDate,
      status: "draft",
    })
    .select("*")
    .single();
  if (error || !data) return { success: false, error: error?.message };
  return { success: true, run: data as PayrollRun };
}

export async function setRunStatus(
  runId: string,
  status: PayrollRunStatus,
  patch: Partial<PayrollRun> = {}
): Promise<{ success: boolean; run?: PayrollRun; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_PAYROLL_RUNS.find((r) => r.id === runId);
    if (!row) return { success: false, error: "Run not found" };
    row.status = status;
    Object.assign(row, patch);
    row.updated_at = nowIso();
    return { success: true, run: row };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_payroll_runs")
    .update({ status, ...patch })
    .eq("id", runId)
    .select("*")
    .single();
  if (error || !data) return { success: false, error: error?.message };
  return { success: true, run: data as PayrollRun };
}

export async function setRunLastComputedAt(runId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_PAYROLL_RUNS.find((r) => r.id === runId);
    if (row) {
      row.last_computed_at = nowIso();
      row.updated_at = nowIso();
    }
    return;
  }
  const supabase = createClient();
  await supabase
    .from("schedule_payroll_runs")
    .update({ last_computed_at: nowIso() })
    .eq("id", runId);
}

export async function setRunExported(
  runId: string,
  format: string
): Promise<void> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_PAYROLL_RUNS.find((r) => r.id === runId);
    if (row) {
      row.last_exported_at = nowIso();
      row.last_export_format = format;
      row.updated_at = nowIso();
    }
    return;
  }
  const supabase = createClient();
  await supabase
    .from("schedule_payroll_runs")
    .update({ last_exported_at: nowIso(), last_export_format: format })
    .eq("id", runId);
}

export async function deleteRun(
  runId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_PAYROLL_RUNS.findIndex((r) => r.id === runId);
    if (idx < 0) return { success: false, error: "Run not found" };
    MOCK_PAYROLL_RUNS.splice(idx, 1);
    // Cascade-delete line items and reconciliation rows.
    for (let i = MOCK_PAYROLL_LINE_ITEMS.length - 1; i >= 0; i--) {
      if (MOCK_PAYROLL_LINE_ITEMS[i].run_id === runId) {
        MOCK_PAYROLL_LINE_ITEMS.splice(i, 1);
      }
    }
    for (let i = MOCK_PAYROLL_RECONCILIATION.length - 1; i >= 0; i--) {
      if (MOCK_PAYROLL_RECONCILIATION[i].run_id === runId) {
        MOCK_PAYROLL_RECONCILIATION.splice(i, 1);
      }
    }
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_payroll_runs")
    .delete()
    .eq("id", runId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
