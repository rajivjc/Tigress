// =============================================================================
// Scheduling — shift attendance flags data layer (Session 26)
// =============================================================================
// Absence-of-row = expected. Insert/upsert only when a manager flips the
// flag to excused or no_show; clearing the flag deletes the row.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_SCHEDULE_SHIFT_ATTENDANCE } from "./mock-data";
import type { AttendanceStatus, ShiftAttendance } from "../types";

const nowIso = () => new Date().toISOString();

export async function getAttendance(
  shiftId: string
): Promise<ShiftAttendance | null> {
  if (!isSupabaseConfigured()) {
    return (
      MOCK_SCHEDULE_SHIFT_ATTENDANCE.find((a) => a.shift_id === shiftId) ?? null
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_shift_attendance")
    .select("*")
    .eq("shift_id", shiftId)
    .maybeSingle();
  return (data as ShiftAttendance | null) ?? null;
}

export async function listAttendanceForShifts(
  shiftIds: string[]
): Promise<ShiftAttendance[]> {
  if (shiftIds.length === 0) return [];
  if (!isSupabaseConfigured()) {
    const set = new Set(shiftIds);
    return MOCK_SCHEDULE_SHIFT_ATTENDANCE.filter((a) => set.has(a.shift_id));
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_shift_attendance")
    .select("*")
    .in("shift_id", shiftIds);
  return (data as ShiftAttendance[] | null) ?? [];
}

export interface SetAttendanceInput {
  shiftId: string;
  status: Exclude<AttendanceStatus, "expected">;
  markedBy: string;
  note: string | null;
}

export async function setAttendance(
  input: SetAttendanceInput
): Promise<{ success: boolean; attendance?: ShiftAttendance; error?: string }> {
  if (!isSupabaseConfigured()) {
    const existing = MOCK_SCHEDULE_SHIFT_ATTENDANCE.find(
      (a) => a.shift_id === input.shiftId
    );
    if (existing) {
      existing.attendance_status = input.status;
      existing.marked_by = input.markedBy;
      existing.marked_at = nowIso();
      existing.note = input.note;
      existing.updated_at = nowIso();
      return { success: true, attendance: existing };
    }
    const row: ShiftAttendance = {
      shift_id: input.shiftId,
      attendance_status: input.status,
      marked_by: input.markedBy,
      marked_at: nowIso(),
      note: input.note,
      updated_at: nowIso(),
    };
    MOCK_SCHEDULE_SHIFT_ATTENDANCE.push(row);
    return { success: true, attendance: row };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_shift_attendance")
    .upsert(
      {
        shift_id: input.shiftId,
        attendance_status: input.status,
        marked_by: input.markedBy,
        marked_at: nowIso(),
        note: input.note,
      },
      { onConflict: "shift_id" }
    )
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Upsert failed" };
  }
  return { success: true, attendance: data as ShiftAttendance };
}

export async function clearAttendance(
  shiftId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_SCHEDULE_SHIFT_ATTENDANCE.findIndex(
      (a) => a.shift_id === shiftId
    );
    if (idx >= 0) MOCK_SCHEDULE_SHIFT_ATTENDANCE.splice(idx, 1);
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_shift_attendance")
    .delete()
    .eq("shift_id", shiftId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
