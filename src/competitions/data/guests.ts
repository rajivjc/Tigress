// =============================================================================
// Competitions — guests (Session 21)
// =============================================================================
// Distinct from `walk_in_guests` — this is the competition-entrant flavour
// of a non-member. Provenance is enforced XOR: either a member invited
// them, or staff registered them (paying guest flow).
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_COMP_GUESTS } from "./mock-data";
import { GUEST_NAME_MAX, GUEST_NAME_MIN } from "../config";
import type { CompetitionGuest } from "../types";

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ListGuestsOpts {
  activeOnly?: boolean;
}

export async function listGuests(
  opts: ListGuestsOpts = {}
): Promise<CompetitionGuest[]> {
  const activeOnly = opts.activeOnly ?? true;

  if (!isSupabaseConfigured()) {
    return MOCK_COMP_GUESTS.filter((g) => (activeOnly ? g.archived_at === null : true))
      .slice()
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  const supabase = createClient();
  let query = supabase.from("comp_guests").select("*");
  if (activeOnly) query = query.is("archived_at", null);
  query = query.order("created_at", { ascending: false });
  const { data } = await query;
  return (data as CompetitionGuest[] | null) ?? [];
}

export async function getGuestById(
  id: string
): Promise<CompetitionGuest | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_GUESTS.find((g) => g.id === id) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_guests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as CompetitionGuest | null) ?? null;
}

export interface CreateGuestInput {
  display_name: string;
  email: string | null;
  phone: string | null;
  is_paying: boolean;
  registered_by_member_id: string | null;
  registered_by_staff_id: string | null;
  notes: string | null;
}

export async function createGuest(
  input: CreateGuestInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const name = input.display_name.trim();
  if (name.length < GUEST_NAME_MIN || name.length > GUEST_NAME_MAX) {
    return {
      success: false,
      error: `Name must be between ${GUEST_NAME_MIN} and ${GUEST_NAME_MAX} characters`,
    };
  }

  // XOR provenance
  const hasMember = input.registered_by_member_id !== null;
  const hasStaff = input.registered_by_staff_id !== null;
  if (hasMember === hasStaff) {
    return {
      success: false,
      error: "Guest must be registered by exactly one of member or staff",
    };
  }

  if (!isSupabaseConfigured()) {
    const id = randomId("comp-guest");
    const row: CompetitionGuest = {
      id,
      display_name: name,
      email: input.email,
      phone: input.phone,
      is_paying: input.is_paying,
      registered_by_member_id: input.registered_by_member_id,
      registered_by_staff_id: input.registered_by_staff_id,
      notes: input.notes,
      created_at: new Date().toISOString(),
      archived_at: null,
    };
    MOCK_COMP_GUESTS.push(row);
    return { success: true, id };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("comp_guests")
    .insert({
      display_name: name,
      email: input.email,
      phone: input.phone,
      is_paying: input.is_paying,
      registered_by_member_id: input.registered_by_member_id,
      registered_by_staff_id: input.registered_by_staff_id,
      notes: input.notes,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, id: (data as { id: string }).id };
}

export async function archiveGuest(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const nowIso = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_GUESTS.find((g) => g.id === id);
    if (!row) return { success: false, error: "Guest not found" };
    row.archived_at = nowIso;
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_guests")
    .update({ archived_at: nowIso })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
