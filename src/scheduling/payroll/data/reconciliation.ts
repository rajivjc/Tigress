// =============================================================================
// Payroll — reconciliation snapshot data layer (Session 27a)
// =============================================================================
// Snapshotted at lock time so locked runs are stable even if upstream clock
// records, rates, OT rules, or holidays change later.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_PAYROLL_RECONCILIATION,
  MOCK_PAYROLL_RUNS,
} from "./mock-data";
import type {
  PayrollHoliday,
  PayrollOvertimeRules,
  PayrollRate,
  PayrollRunReconciliation,
} from "../types";
import type { ClockRecord } from "../../types";

const nowIso = () => new Date().toISOString();

export interface SnapshotInput {
  runId: string;
  clockRecords: ClockRecord[];
  ratesSnapshot: PayrollRate[];
  overtimeRulesSnapshot: PayrollOvertimeRules;
  holidaysSnapshot: PayrollHoliday[];
}

/**
 * Atomically locks the run by writing the reconciliation snapshot AND
 * transitioning status. Mock mode mirrors the RPC's behaviour with
 * throw-rollback.
 */
export async function lockRunWithSnapshot(
  input: SnapshotInput,
  lockerStaffId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const run = MOCK_PAYROLL_RUNS.find((r) => r.id === input.runId);
    if (!run) return { success: false, error: "Run not found" };
    if (run.status !== "review") {
      return { success: false, error: "Run is not in review status" };
    }
    const existing = MOCK_PAYROLL_RECONCILIATION.find(
      (r) => r.run_id === input.runId
    );
    if (existing) {
      return { success: false, error: "Reconciliation already exists" };
    }
    // Snapshot pre-call state so a re-lock cycle (where locked_by /
    // locked_at carry the PRIOR lock's values until the new lock writes)
    // restores the prior values rather than wiping to nulls. Without this,
    // a failed re-lock would erase the original locker's identity even
    // though the run is still validly "previously-locked, now in review".
    const snapshot = {
      status: run.status,
      locked_at: run.locked_at,
      locked_by: run.locked_by,
      unlock_note: run.unlock_note,
      updated_at: run.updated_at,
    };
    try {
      MOCK_PAYROLL_RECONCILIATION.push({
        run_id: input.runId,
        clock_records: input.clockRecords,
        rates_snapshot: input.ratesSnapshot,
        overtime_rules_snapshot: input.overtimeRulesSnapshot,
        holidays_snapshot: input.holidaysSnapshot,
        locked_at: nowIso(),
      });
      run.status = "locked";
      run.locked_at = nowIso();
      run.locked_by = lockerStaffId;
      // Re-locking after unlock leaves unlocked_by/unlocked_at in place (they
      // describe the prior unlock event); unlock_note is cleared because the
      // current state is no longer "unlocked with reason X".
      run.unlock_note = null;
      run.updated_at = nowIso();
      return { success: true };
    } catch (err) {
      // Rollback to the snapshotted pre-call state, NOT to nulls. Mirrors
      // a SQL transaction's ROLLBACK semantics so a failed re-lock leaves
      // the prior lock cycle's locked_by/locked_at intact.
      const idx = MOCK_PAYROLL_RECONCILIATION.findIndex(
        (r) => r.run_id === input.runId
      );
      if (idx >= 0) MOCK_PAYROLL_RECONCILIATION.splice(idx, 1);
      run.status = snapshot.status;
      run.locked_at = snapshot.locked_at;
      run.locked_by = snapshot.locked_by;
      run.unlock_note = snapshot.unlock_note;
      run.updated_at = snapshot.updated_at;
      return {
        success: false,
        error: err instanceof Error ? err.message : "Lock failed",
      };
    }
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("schedule_payroll_lock_run", {
    p_run_id: input.runId,
    p_locker_staff_id: lockerStaffId,
    p_clock_records: input.clockRecords,
    p_rates_snapshot: input.ratesSnapshot,
    p_overtime_rules_snapshot: input.overtimeRulesSnapshot,
    p_holidays_snapshot: input.holidaysSnapshot,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Unlock the run: deletes the reconciliation snapshot and transitions to
 * review. Required note enforced by the RPC; mock mode validates inline.
 *
 * Mock mode mirrors `lockRunWithSnapshot`'s snapshot + throw-rollback
 * pattern (S27a-fix-2 Finding 16). A failed mid-unlock leaves the
 * reconciliation row intact and restores the run row to its pre-call
 * state (status, unlock metadata, updated_at) so the lock cycle isn't
 * silently wiped to a half-state.
 */
export async function unlockRun(
  runId: string,
  unlockerStaffId: string,
  note: string
): Promise<{ success: boolean; error?: string }> {
  if (!note.trim()) {
    return { success: false, error: "Unlock note is required" };
  }
  if (!isSupabaseConfigured()) {
    const run = MOCK_PAYROLL_RUNS.find((r) => r.id === runId);
    if (!run) return { success: false, error: "Run not found" };
    if (run.status !== "locked") {
      return { success: false, error: "Run is not locked" };
    }
    const idx = MOCK_PAYROLL_RECONCILIATION.findIndex(
      (r) => r.run_id === runId
    );
    // Snapshot pre-call state for rollback parity with lockRunWithSnapshot.
    const reconSnapshot =
      idx >= 0 ? { ...MOCK_PAYROLL_RECONCILIATION[idx] } : null;
    const runSnapshot = {
      status: run.status,
      unlocked_at: run.unlocked_at,
      unlocked_by: run.unlocked_by,
      unlock_note: run.unlock_note,
      updated_at: run.updated_at,
    };
    try {
      if (idx >= 0) MOCK_PAYROLL_RECONCILIATION.splice(idx, 1);
      run.status = "review";
      // locked_by / locked_at preserved across the unlock so the UI can show
      // the original locker alongside the current unlocker. The next re-lock
      // will overwrite them.
      run.unlocked_by = unlockerStaffId;
      run.unlocked_at = nowIso();
      run.unlock_note = note;
      run.updated_at = nowIso();
      return { success: true };
    } catch (err) {
      // Rollback to the snapshotted pre-call state. Idempotent re-insert:
      // only put the snapshot back if the row is genuinely gone — if the
      // splice itself threw, the row is still in the array and a second
      // splice would create a duplicate.
      if (
        reconSnapshot &&
        !MOCK_PAYROLL_RECONCILIATION.some((r) => r.run_id === runId)
      ) {
        MOCK_PAYROLL_RECONCILIATION.splice(idx, 0, reconSnapshot);
      }
      run.status = runSnapshot.status;
      run.unlocked_at = runSnapshot.unlocked_at;
      run.unlocked_by = runSnapshot.unlocked_by;
      run.unlock_note = runSnapshot.unlock_note;
      run.updated_at = runSnapshot.updated_at;
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unlock failed",
      };
    }
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("schedule_payroll_unlock_run", {
    p_run_id: runId,
    p_unlocker_staff_id: unlockerStaffId,
    p_note: note,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getReconciliation(
  runId: string
): Promise<PayrollRunReconciliation | null> {
  if (!isSupabaseConfigured()) {
    return (
      MOCK_PAYROLL_RECONCILIATION.find((r) => r.run_id === runId) ?? null
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_payroll_run_reconciliation")
    .select("*")
    .eq("run_id", runId)
    .maybeSingle();
  return (data as PayrollRunReconciliation | null) ?? null;
}
