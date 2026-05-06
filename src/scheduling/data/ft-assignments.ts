// =============================================================================
// Scheduling — FT standing assignments (Session 25)
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_SCHEDULE_FT_ASSIGNMENTS } from "./mock-data";
import type { FtAssignment, Qualification } from "../types";

const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function listFtAssignments(): Promise<FtAssignment[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_FT_ASSIGNMENTS.slice();
  }
  const supabase = createClient();
  const { data } = await supabase.from("schedule_ft_assignments").select("*");
  return (data as FtAssignment[] | null) ?? [];
}

export async function listFtAssignmentsForUser(
  userId: string
): Promise<FtAssignment[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_FT_ASSIGNMENTS.filter((r) => r.user_id === userId);
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_ft_assignments")
    .select("*")
    .eq("user_id", userId);
  return (data as FtAssignment[] | null) ?? [];
}

export interface UpsertFtAssignmentInput {
  user_id: string;
  template_id: string;
  day_of_week: number;
  role: Qualification;
  effective_from: string;
  effective_until?: string | null;
}

export async function upsertFtAssignment(
  input: UpsertFtAssignmentInput
): Promise<{ success: boolean; assignmentId?: string; error?: string }> {
  if (input.day_of_week < 0 || input.day_of_week > 6) {
    return { success: false, error: "day_of_week must be 0..6" };
  }
  if (!input.effective_from) {
    return { success: false, error: "effective_from is required" };
  }

  if (!isSupabaseConfigured()) {
    const newRow: FtAssignment = {
      id: id("schedule-ft"),
      user_id: input.user_id,
      template_id: input.template_id,
      day_of_week: input.day_of_week,
      role: input.role,
      effective_from: input.effective_from,
      effective_until: input.effective_until ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    MOCK_SCHEDULE_FT_ASSIGNMENTS.push(newRow);
    return { success: true, assignmentId: newRow.id };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_ft_assignments")
    .insert({
      user_id: input.user_id,
      template_id: input.template_id,
      day_of_week: input.day_of_week,
      role: input.role,
      effective_from: input.effective_from,
      effective_until: input.effective_until ?? null,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, assignmentId: (data as { id: string }).id };
}

export async function endFtAssignment(
  assignmentId: string,
  effectiveUntil: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_SCHEDULE_FT_ASSIGNMENTS.find((r) => r.id === assignmentId);
    if (!row) return { success: false, error: "Assignment not found" };
    row.effective_until = effectiveUntil;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_ft_assignments")
    .update({ effective_until: effectiveUntil })
    .eq("id", assignmentId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
