// =============================================================================
// Scheduling — clock records data layer (Session 26)
// =============================================================================
// Honor-system clock-in/out. Status flow:
//   active             — clocked in but not yet out
//   pending_review     — clocked out, awaiting manager lock
//   locked             — manager-locked, immutable except via unlock+note
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_SCHEDULE_CLOCK_RECORDS } from "./mock-data";
import type { ClockRecord, ClockRecordStatus } from "../types";

const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

export async function getClockRecord(
  recordId: string
): Promise<ClockRecord | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_CLOCK_RECORDS.find((r) => r.id === recordId) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_clock_records")
    .select("*")
    .eq("id", recordId)
    .maybeSingle();
  return (data as ClockRecord | null) ?? null;
}

export async function getClockRecordForShift(
  shiftId: string,
  userId: string
): Promise<ClockRecord | null> {
  if (!isSupabaseConfigured()) {
    return (
      MOCK_SCHEDULE_CLOCK_RECORDS.find(
        (r) => r.shift_id === shiftId && r.user_id === userId
      ) ?? null
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_clock_records")
    .select("*")
    .eq("shift_id", shiftId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ClockRecord | null) ?? null;
}

export async function listClockRecordsForUser(
  userId: string,
  limit = 50
): Promise<ClockRecord[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_CLOCK_RECORDS.filter((r) => r.user_id === userId)
      .slice()
      .sort((a, b) => b.clocked_in_at.localeCompare(a.clocked_in_at))
      .slice(0, limit);
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_clock_records")
    .select("*")
    .eq("user_id", userId)
    .order("clocked_in_at", { ascending: false })
    .limit(limit);
  return (data as ClockRecord[] | null) ?? [];
}

export async function listClockRecordsForShifts(
  shiftIds: string[]
): Promise<ClockRecord[]> {
  if (shiftIds.length === 0) return [];
  if (!isSupabaseConfigured()) {
    const set = new Set(shiftIds);
    return MOCK_SCHEDULE_CLOCK_RECORDS.filter((r) => set.has(r.shift_id));
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_clock_records")
    .select("*")
    .in("shift_id", shiftIds);
  return (data as ClockRecord[] | null) ?? [];
}

/**
 * Returns every locked clock record whose `clocked_in_at` falls within
 * `[periodStartIso, periodEndExclusiveIso)`. The payroll engine and the
 * lock-snapshot path both consume this — replaces the per-staff loop both
 * sites used to run.
 */
export async function listClockRecordsInPeriod(
  periodStartIso: string,
  periodEndExclusiveIso: string
): Promise<ClockRecord[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_CLOCK_RECORDS.filter(
      (r) =>
        r.status === "locked" &&
        r.clocked_in_at >= periodStartIso &&
        r.clocked_in_at < periodEndExclusiveIso
    )
      .slice()
      .sort((a, b) => a.clocked_in_at.localeCompare(b.clocked_in_at));
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_clock_records")
    .select("*")
    .eq("status", "locked")
    .gte("clocked_in_at", periodStartIso)
    .lt("clocked_in_at", periodEndExclusiveIso)
    .order("clocked_in_at", { ascending: true });
  return (data as ClockRecord[] | null) ?? [];
}

export interface ClockInInput {
  shiftId: string;
  userId: string;
  clockedInAt?: string;
}

export async function clockIn(
  input: ClockInInput
): Promise<{ success: boolean; record?: ClockRecord; error?: string }> {
  const existing = await getClockRecordForShift(input.shiftId, input.userId);
  if (existing) {
    return { success: false, error: "Already clocked in for this shift" };
  }
  const ts = input.clockedInAt ?? nowIso();

  if (!isSupabaseConfigured()) {
    const row: ClockRecord = {
      id: id("schedule-clock"),
      shift_id: input.shiftId,
      user_id: input.userId,
      clocked_in_at: ts,
      clocked_out_at: null,
      status: "active",
      locked_at: null,
      locked_by: null,
      unlock_note: null,
      manager_edited: false,
      manager_edit_note: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    MOCK_SCHEDULE_CLOCK_RECORDS.push(row);
    return { success: true, record: row };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_clock_records")
    .insert({
      shift_id: input.shiftId,
      user_id: input.userId,
      clocked_in_at: ts,
      status: "active",
    })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, record: data as ClockRecord };
}

export async function clockOut(
  recordId: string,
  clockedOutAt?: string
): Promise<{ success: boolean; record?: ClockRecord; error?: string }> {
  const existing = await getClockRecord(recordId);
  if (!existing) return { success: false, error: "Clock record not found" };
  if (existing.status !== "active") {
    return { success: false, error: `Cannot clock out from status ${existing.status}` };
  }
  const ts = clockedOutAt ?? nowIso();

  if (!isSupabaseConfigured()) {
    existing.clocked_out_at = ts;
    existing.status = "pending_review";
    existing.updated_at = nowIso();
    return { success: true, record: existing };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_clock_records")
    .update({ clocked_out_at: ts, status: "pending_review" })
    .eq("id", recordId)
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Update failed" };
  }
  return { success: true, record: data as ClockRecord };
}

export interface ManagerEditInput {
  recordId: string;
  clockedInAt: string;
  clockedOutAt: string;
  note: string;
}

/**
 * Manager-driven edit. Branches on the current record status:
 *   * `active`         — preserve the empty clocked_out_at (the staff is
 *                        still on shift) and KEEP status `active`. Only the
 *                        clocked_in_at can be retroactively adjusted.
 *   * `pending_review` — set both timestamps, status remains `pending_review`.
 *   * `locked`         — rejected. Unlock first.
 *
 * Fixes S26 Medium 3 where editing an active record set clocked_out_at to a
 * stale value AND flipped status to pending_review prematurely.
 */
export async function managerEditClockRecord(
  input: ManagerEditInput
): Promise<{ success: boolean; record?: ClockRecord; error?: string }> {
  const existing = await getClockRecord(input.recordId);
  if (!existing) return { success: false, error: "Clock record not found" };
  if (existing.status === "locked") {
    return { success: false, error: "Cannot edit a locked record. Unlock first." };
  }

  const isActive = existing.status === "active";

  if (!isSupabaseConfigured()) {
    existing.clocked_in_at = input.clockedInAt;
    if (!isActive) {
      existing.clocked_out_at = input.clockedOutAt;
    }
    existing.manager_edited = true;
    existing.manager_edit_note = input.note;
    // Active stays active; pending_review stays pending_review.
    existing.updated_at = nowIso();
    return { success: true, record: existing };
  }
  const supabase = createClient();
  const patch: Record<string, unknown> = {
    clocked_in_at: input.clockedInAt,
    manager_edited: true,
    manager_edit_note: input.note,
  };
  if (!isActive) {
    patch.clocked_out_at = input.clockedOutAt;
  }
  const { data, error } = await supabase
    .from("schedule_clock_records")
    .update(patch)
    .eq("id", input.recordId)
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Update failed" };
  }
  return { success: true, record: data as ClockRecord };
}

/**
 * S26 Medium 5: manager-driven creation of a clock record for a past shift
 * where the staff member forgot to clock in. Validates ownership and
 * no-existing-record. Created in `pending_review` (clock-out provided)
 * with manager_edited=true and the note.
 */
export interface CreateAsManagerInput {
  shiftId: string;
  userId: string;
  clockedInAt: string;
  clockedOutAt: string;
  note: string;
}

export async function createClockRecordAsManager(
  input: CreateAsManagerInput
): Promise<{ success: boolean; record?: ClockRecord; error?: string }> {
  if (!input.note.trim()) {
    return { success: false, error: "Note is required" };
  }
  const existing = await getClockRecordForShift(input.shiftId, input.userId);
  if (existing) {
    return { success: false, error: "Clock record already exists for this shift" };
  }

  if (!isSupabaseConfigured()) {
    const row: ClockRecord = {
      id: id("schedule-clock"),
      shift_id: input.shiftId,
      user_id: input.userId,
      clocked_in_at: input.clockedInAt,
      clocked_out_at: input.clockedOutAt,
      status: "pending_review",
      locked_at: null,
      locked_by: null,
      unlock_note: null,
      manager_edited: true,
      manager_edit_note: input.note,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    MOCK_SCHEDULE_CLOCK_RECORDS.push(row);
    return { success: true, record: row };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_clock_records")
    .insert({
      shift_id: input.shiftId,
      user_id: input.userId,
      clocked_in_at: input.clockedInAt,
      clocked_out_at: input.clockedOutAt,
      status: "pending_review",
      manager_edited: true,
      manager_edit_note: input.note,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, record: data as ClockRecord };
}

export async function lockClockRecords(
  recordIds: string[],
  lockerStaffId: string
): Promise<{ success: boolean; locked: number; error?: string }> {
  if (recordIds.length === 0) return { success: true, locked: 0 };

  if (!isSupabaseConfigured()) {
    // All-or-nothing — verify every record is in pending_review first.
    const targets = MOCK_SCHEDULE_CLOCK_RECORDS.filter((r) =>
      recordIds.includes(r.id)
    );
    if (targets.length !== recordIds.length) {
      return { success: false, locked: 0, error: "One or more records not found" };
    }
    const wrongState = targets.find((r) => r.status !== "pending_review");
    if (wrongState) {
      return {
        success: false,
        locked: 0,
        error: "One or more clock records are not in pending_review status",
      };
    }
    for (const r of targets) {
      r.status = "locked";
      r.locked_at = nowIso();
      r.locked_by = lockerStaffId;
      r.unlock_note = null;
      r.updated_at = nowIso();
    }
    return { success: true, locked: targets.length };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "schedule_lock_clock_records",
    { p_record_ids: recordIds, p_locker_staff_id: lockerStaffId }
  );
  if (error) return { success: false, locked: 0, error: error.message };
  return { success: true, locked: typeof data === "number" ? data : recordIds.length };
}

export async function unlockClockRecord(
  recordId: string,
  note: string
): Promise<{ success: boolean; record?: ClockRecord; error?: string }> {
  const existing = await getClockRecord(recordId);
  if (!existing) return { success: false, error: "Clock record not found" };
  if (existing.status !== "locked") {
    return { success: false, error: "Record is not locked" };
  }
  if (!note.trim()) {
    return { success: false, error: "Unlock note is required" };
  }

  if (!isSupabaseConfigured()) {
    existing.status = "pending_review";
    existing.locked_at = null;
    existing.locked_by = null;
    existing.unlock_note = note;
    existing.updated_at = nowIso();
    return { success: true, record: existing };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_clock_records")
    .update({
      status: "pending_review" satisfies ClockRecordStatus,
      locked_at: null,
      locked_by: null,
      unlock_note: note,
    })
    .eq("id", recordId)
    .eq("status", "locked")
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Update failed" };
  }
  return { success: true, record: data as ClockRecord };
}
