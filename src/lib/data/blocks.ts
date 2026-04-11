// =============================================================================
// Blocked-slot data accessors
// =============================================================================
// Server-only helpers for creating, deleting, and querying blocked_slots.
// Falls back to an in-memory mock store when Supabase is not configured so
// the staff /staff/block flow remains testable end-to-end.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { BlockedSlot } from "@/lib/types";

// In-memory store used in mock mode. Module-level so blocks survive across
// re-renders within the same dev server process.
const MOCK_BLOCKS: BlockedSlot[] = [];

/**
 * Tracks tables whose synthetic "demo" block has been unblocked by staff in
 * mock mode. The floorplan helper consults this set so the demo block on
 * (e.g.) table 7 stays cleared after a manager taps Unblock.
 */
const MOCK_UNBLOCKED_TABLE_IDS = new Set<string>();

export function isMockTableUnblocked(tableId: string): boolean {
  return MOCK_UNBLOCKED_TABLE_IDS.has(tableId);
}

export interface CreateBlockInput {
  table_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  notes?: string | null;
  created_by: string;
}

export interface CreateBlockResult {
  success: boolean;
  block_id?: string;
  error?: string;
}

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function validateBlockInput(input: CreateBlockInput): string | null {
  const startMs = Date.parse(input.starts_at);
  const endMs = Date.parse(input.ends_at);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return "Invalid start or end time";
  }
  if (endMs <= startMs) {
    return "End time must be after start time";
  }
  if (startMs <= Date.now()) {
    return "Start time must be in the future";
  }
  if (!input.reason || input.reason.trim().length === 0) {
    return "Reason is required";
  }
  return null;
}

export async function createBlock(
  input: CreateBlockInput
): Promise<CreateBlockResult> {
  const error = validateBlockInput(input);
  if (error) return { success: false, error };

  if (!isSupabaseConfigured()) {
    // Reject if it overlaps another mock block on the same table.
    const clash = MOCK_BLOCKS.find(
      (b) =>
        b.table_id === input.table_id &&
        rangesOverlap(input.starts_at, input.ends_at, b.starts_at, b.ends_at)
    );
    if (clash) {
      return { success: false, error: "Overlaps an existing block" };
    }
    const id = `mock-block-${Date.now()}`;
    MOCK_BLOCKS.push({
      id,
      table_id: input.table_id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      reason: input.reason,
      notes: input.notes ?? null,
      created_by: input.created_by,
      created_at: new Date().toISOString(),
    });
    return { success: true, block_id: id };
  }

  const supabase = createClient();

  // Reject if there's an overlapping confirmed booking — staff can either
  // cancel the booking first or pick a different window.
  const { data: clashing, error: clashErr } = await supabase
    .from("bookings")
    .select("id")
    .eq("table_id", input.table_id)
    .eq("status", "confirmed")
    .lt("starts_at", input.ends_at)
    .gt("ends_at", input.starts_at)
    .limit(1);
  if (clashErr) return { success: false, error: clashErr.message };
  if ((clashing as { id: string }[] | null)?.length) {
    return {
      success: false,
      error: "Cannot block — there is an existing booking in this window",
    };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("blocked_slots")
    .insert({
      table_id: input.table_id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      reason: input.reason,
      notes: input.notes ?? null,
      created_by: input.created_by,
    })
    .select("id")
    .single();

  if (insertErr) return { success: false, error: insertErr.message };
  return { success: true, block_id: (inserted as { id: string }).id };
}

export async function deleteBlock(
  blockId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_BLOCKS.findIndex((b) => b.id === blockId);
    if (idx === -1) return { success: false, error: "Block not found" };
    MOCK_BLOCKS.splice(idx, 1);
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("blocked_slots")
    .delete()
    .eq("id", blockId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Removes any currently-active block on a given table. Used by the
 * "Unblock" button on the staff floor view, which doesn't know the block id.
 */
export async function deleteActiveBlockForTable(
  tableId: string
): Promise<{ success: boolean; error?: string }> {
  const nowIso = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const idx = MOCK_BLOCKS.findIndex(
      (b) =>
        b.table_id === tableId &&
        b.starts_at <= nowIso &&
        b.ends_at > nowIso
    );
    if (idx >= 0) {
      MOCK_BLOCKS.splice(idx, 1);
    }
    // Always mark the table as unblocked so the demo synthetic block on
    // (e.g.) table 7 also clears from the floor view.
    MOCK_UNBLOCKED_TABLE_IDS.add(tableId);
    return { success: true };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("blocked_slots")
    .select("id")
    .eq("table_id", tableId)
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso)
    .limit(1);
  if (error) return { success: false, error: error.message };
  const row = (data as { id: string }[] | null)?.[0];
  if (!row) return { success: false, error: "No active block" };
  const { error: delErr } = await supabase
    .from("blocked_slots")
    .delete()
    .eq("id", row.id);
  if (delErr) return { success: false, error: delErr.message };
  return { success: true };
}

export function _mockBlocksForTesting(): BlockedSlot[] {
  return MOCK_BLOCKS;
}
