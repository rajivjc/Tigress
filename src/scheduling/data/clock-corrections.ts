// =============================================================================
// Scheduling — clock correction requests data layer (Session 26)
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_SCHEDULE_CLOCK_CORRECTIONS } from "./mock-data";
import type { ClockCorrection, CorrectionStatus } from "../types";

const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

export async function getCorrection(
  correctionId: string
): Promise<ClockCorrection | null> {
  if (!isSupabaseConfigured()) {
    return (
      MOCK_SCHEDULE_CLOCK_CORRECTIONS.find((c) => c.id === correctionId) ?? null
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_clock_corrections")
    .select("*")
    .eq("id", correctionId)
    .maybeSingle();
  return (data as ClockCorrection | null) ?? null;
}

export async function listPendingCorrections(): Promise<ClockCorrection[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_CLOCK_CORRECTIONS.filter(
      (c) => c.status === "pending"
    )
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_clock_corrections")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data as ClockCorrection[] | null) ?? [];
}

export async function listCorrectionsForRecord(
  recordId: string
): Promise<ClockCorrection[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_CLOCK_CORRECTIONS.filter(
      (c) => c.clock_record_id === recordId
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_clock_corrections")
    .select("*")
    .eq("clock_record_id", recordId);
  return (data as ClockCorrection[] | null) ?? [];
}

export interface CreateCorrectionInput {
  clockRecordId: string;
  requestedBy: string;
  proposedClockedInAt: string | null;
  proposedClockedOutAt: string | null;
  reason: string;
}

export async function createCorrection(
  input: CreateCorrectionInput
): Promise<{ success: boolean; correction?: ClockCorrection; error?: string }> {
  if (!input.proposedClockedInAt && !input.proposedClockedOutAt) {
    return {
      success: false,
      error: "At least one proposed timestamp is required",
    };
  }
  if (!input.reason.trim()) {
    return { success: false, error: "Reason is required" };
  }

  if (!isSupabaseConfigured()) {
    const row: ClockCorrection = {
      id: id("schedule-correction"),
      clock_record_id: input.clockRecordId,
      requested_by: input.requestedBy,
      proposed_clocked_in_at: input.proposedClockedInAt,
      proposed_clocked_out_at: input.proposedClockedOutAt,
      reason: input.reason,
      status: "pending",
      resolved_by: null,
      resolved_at: null,
      resolution_note: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    MOCK_SCHEDULE_CLOCK_CORRECTIONS.push(row);
    return { success: true, correction: row };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_clock_corrections")
    .insert({
      clock_record_id: input.clockRecordId,
      requested_by: input.requestedBy,
      proposed_clocked_in_at: input.proposedClockedInAt,
      proposed_clocked_out_at: input.proposedClockedOutAt,
      reason: input.reason,
      status: "pending" satisfies CorrectionStatus,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, correction: data as ClockCorrection };
}

export async function setCorrectionStatus(
  correctionId: string,
  status: "approved" | "denied",
  resolverStaffId: string,
  note: string | null
): Promise<{ success: boolean; correction?: ClockCorrection; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_SCHEDULE_CLOCK_CORRECTIONS.find(
      (c) => c.id === correctionId
    );
    if (!row) return { success: false, error: "Correction not found" };
    if (row.status !== "pending") {
      return { success: false, error: "Correction is not pending" };
    }
    row.status = status;
    row.resolved_by = resolverStaffId;
    row.resolved_at = nowIso();
    row.resolution_note = note;
    row.updated_at = nowIso();
    return { success: true, correction: row };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_clock_corrections")
    .update({
      status,
      resolved_by: resolverStaffId,
      resolved_at: nowIso(),
      resolution_note: note,
    })
    .eq("id", correctionId)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Update failed" };
  }
  return { success: true, correction: data as ClockCorrection };
}
