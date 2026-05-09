// =============================================================================
// Scheduling — shift change requests data layer (Session 26)
// =============================================================================
// Single table for direct swaps and giveaways, discriminated by `kind`.
// Acceptance flips both the request status AND schedule_shifts.user_id
// inside the schedule_accept_swap RPC; mock mode mirrors that atomicity.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_SCHEDULE_SHIFTS,
  MOCK_SCHEDULE_SHIFT_CHANGE_REQUESTS,
} from "./mock-data";
import type {
  ShiftChangeKind,
  ShiftChangeRequest,
  ShiftChangeStatus,
} from "../types";

const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

export async function getChangeRequest(
  requestId: string
): Promise<ShiftChangeRequest | null> {
  if (!isSupabaseConfigured()) {
    return (
      MOCK_SCHEDULE_SHIFT_CHANGE_REQUESTS.find((r) => r.id === requestId) ??
      null
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_shift_change_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  return (data as ShiftChangeRequest | null) ?? null;
}

export async function listMyOutgoingRequests(
  userId: string
): Promise<ShiftChangeRequest[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_SHIFT_CHANGE_REQUESTS.filter(
      (r) => r.requested_by === userId
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_shift_change_requests")
    .select("*")
    .eq("requested_by", userId);
  return (data as ShiftChangeRequest[] | null) ?? [];
}

export async function listIncomingDirectSwaps(
  userId: string
): Promise<ShiftChangeRequest[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_SHIFT_CHANGE_REQUESTS.filter(
      (r) =>
        r.kind === "direct_swap" &&
        r.target_user_id === userId &&
        r.status === "pending"
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_shift_change_requests")
    .select("*")
    .eq("kind", "direct_swap")
    .eq("target_user_id", userId)
    .eq("status", "pending");
  return (data as ShiftChangeRequest[] | null) ?? [];
}

export async function listOpenGiveaways(): Promise<ShiftChangeRequest[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_SHIFT_CHANGE_REQUESTS.filter(
      (r) => r.kind === "giveaway" && r.status === "pending"
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_shift_change_requests")
    .select("*")
    .eq("kind", "giveaway")
    .eq("status", "pending");
  return (data as ShiftChangeRequest[] | null) ?? [];
}

export async function listRecentlyAccepted(
  sinceIso: string
): Promise<ShiftChangeRequest[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_SHIFT_CHANGE_REQUESTS.filter(
      (r) =>
        r.status === "accepted" &&
        r.resolved_at !== null &&
        r.resolved_at >= sinceIso
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_shift_change_requests")
    .select("*")
    .eq("status", "accepted")
    .gte("resolved_at", sinceIso);
  return (data as ShiftChangeRequest[] | null) ?? [];
}

export async function listChangeRequestsForShifts(
  shiftIds: string[]
): Promise<ShiftChangeRequest[]> {
  if (shiftIds.length === 0) return [];
  if (!isSupabaseConfigured()) {
    const set = new Set(shiftIds);
    return MOCK_SCHEDULE_SHIFT_CHANGE_REQUESTS.filter((r) => set.has(r.shift_id));
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_shift_change_requests")
    .select("*")
    .in("shift_id", shiftIds);
  return (data as ShiftChangeRequest[] | null) ?? [];
}

export interface CreateChangeRequestInput {
  kind: ShiftChangeKind;
  shiftId: string;
  requestedBy: string;
  targetUserId: string | null;
}

export async function createChangeRequest(
  input: CreateChangeRequestInput
): Promise<{ success: boolean; request?: ShiftChangeRequest; error?: string }> {
  if (input.kind === "direct_swap" && !input.targetUserId) {
    return { success: false, error: "Direct swap requires a target user" };
  }
  if (input.kind === "giveaway" && input.targetUserId) {
    return { success: false, error: "Giveaways must not have a target" };
  }

  if (!isSupabaseConfigured()) {
    const row: ShiftChangeRequest = {
      id: id("schedule-change"),
      kind: input.kind,
      shift_id: input.shiftId,
      requested_by: input.requestedBy,
      target_user_id: input.targetUserId,
      status: "pending",
      accepted_by: null,
      resolved_at: null,
      reversal_note: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    MOCK_SCHEDULE_SHIFT_CHANGE_REQUESTS.push(row);
    return { success: true, request: row };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_shift_change_requests")
    .insert({
      kind: input.kind,
      shift_id: input.shiftId,
      requested_by: input.requestedBy,
      target_user_id: input.targetUserId,
      status: "pending" satisfies ShiftChangeStatus,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, request: data as ShiftChangeRequest };
}

/**
 * Atomically accept a swap. Real mode delegates to the
 * schedule_accept_swap RPC; mock mode applies the same two-row update.
 */
export async function acceptChangeRequest(
  requestId: string,
  acceptorUserId: string
): Promise<{ success: boolean; request?: ShiftChangeRequest; error?: string }> {
  if (!isSupabaseConfigured()) {
    const req = MOCK_SCHEDULE_SHIFT_CHANGE_REQUESTS.find((r) => r.id === requestId);
    if (!req) return { success: false, error: "Request not found" };
    if (req.status !== "pending") {
      return { success: false, error: "Request is not pending" };
    }
    if (req.kind === "direct_swap" && req.target_user_id !== acceptorUserId) {
      return { success: false, error: "Acceptor is not the targeted user" };
    }
    const shift = MOCK_SCHEDULE_SHIFTS.find((s) => s.id === req.shift_id);
    if (!shift) return { success: false, error: "Shift not found" };
    req.status = "accepted";
    req.accepted_by = acceptorUserId;
    req.resolved_at = nowIso();
    req.updated_at = nowIso();
    shift.user_id = acceptorUserId;
    shift.updated_at = nowIso();
    return { success: true, request: req };
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("schedule_accept_swap", {
    p_request_id: requestId,
    p_acceptor_staff_id: acceptorUserId,
  });
  if (error) return { success: false, error: error.message };
  const refetched = await getChangeRequest(requestId);
  return { success: true, request: refetched ?? undefined };
}

export async function setChangeRequestStatus(
  requestId: string,
  status: Exclude<ShiftChangeStatus, "accepted">,
  resolverUserId: string | null,
  reversalNote: string | null
): Promise<{ success: boolean; request?: ShiftChangeRequest; error?: string }> {
  if (!isSupabaseConfigured()) {
    const req = MOCK_SCHEDULE_SHIFT_CHANGE_REQUESTS.find((r) => r.id === requestId);
    if (!req) return { success: false, error: "Request not found" };
    req.status = status;
    if (status === "reversed") {
      req.reversal_note = reversalNote;
    }
    if (
      status === "declined" ||
      status === "cancelled" ||
      status === "reversed"
    ) {
      req.resolved_at = nowIso();
      if (status !== "reversed") {
        req.accepted_by = resolverUserId;
      }
    }
    req.updated_at = nowIso();
    return { success: true, request: req };
  }
  const supabase = createClient();
  const update: Record<string, unknown> = { status };
  if (status === "reversed") update.reversal_note = reversalNote;
  if (status !== "pending") update.resolved_at = nowIso();
  const { data, error } = await supabase
    .from("schedule_shift_change_requests")
    .update(update)
    .eq("id", requestId)
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Update failed" };
  }
  return { success: true, request: data as ShiftChangeRequest };
}
