// =============================================================================
// Competitions — seasons (Session 23)
// =============================================================================
// A season is independent of any specific league — multiple leagues can share
// a season. Lifecycle: planned → active → completed → archived.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_COMP_SEASONS } from "./mock-data";
import type { Season, SeasonStatus } from "../types";

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const VALID_STATUS: SeasonStatus[] = [
  "planned",
  "active",
  "completed",
  "archived",
];

export interface ListSeasonsOpts {
  status?: SeasonStatus;
}

export async function listSeasons(
  opts: ListSeasonsOpts = {}
): Promise<Season[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_SEASONS.filter((s) => {
      if (opts.status && s.status !== opts.status) return false;
      return true;
    })
      .slice()
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  }
  const supabase = createClient();
  let query = supabase
    .from("comp_seasons")
    .select("*")
    .order("starts_at", { ascending: false });
  if (opts.status) query = query.eq("status", opts.status);
  const { data } = await query;
  return (data as Season[] | null) ?? [];
}

export async function getSeason(id: string): Promise<Season | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_SEASONS.find((s) => s.id === id) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_seasons")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Season | null) ?? null;
}

export interface CreateSeasonInput {
  name: string;
  starts_at: string;
  ends_at: string | null;
}

export async function createSeason(
  input: CreateSeasonInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    return { success: false, error: "Season name must be 1–80 characters" };
  }
  if (!input.starts_at) {
    return { success: false, error: "starts_at is required" };
  }

  const nowIso = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const id = randomId("comp-season");
    MOCK_COMP_SEASONS.push({
      id,
      name,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      status: "planned",
      next_season_id: null,
      created_at: nowIso,
      updated_at: nowIso,
    });
    return { success: true, id };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("comp_seasons")
    .insert({
      name,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, id: (data as { id: string }).id };
}

export async function updateSeasonStatus(
  id: string,
  status: SeasonStatus
): Promise<{ success: boolean; error?: string }> {
  if (!VALID_STATUS.includes(status)) {
    return { success: false, error: "Invalid season status" };
  }

  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_SEASONS.find((s) => s.id === id);
    if (!row) return { success: false, error: "Season not found" };
    row.status = status;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_seasons")
    .update({ status })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Soft-archive: flips status to 'archived' so historical divisions /
 * competitions remain resolvable. Intentionally non-destructive.
 */
export async function archiveSeason(
  id: string
): Promise<{ success: boolean; error?: string }> {
  return updateSeasonStatus(id, "archived");
}

/**
 * S24b2: point a season at the season that follows it. Required before
 * promotion/relegation finalize can resolve target divisions. `null`
 * clears the pointer.
 */
export async function setNextSeasonId(
  id: string,
  nextSeasonId: string | null
): Promise<{ success: boolean; error?: string }> {
  if (nextSeasonId !== null && nextSeasonId === id) {
    return { success: false, error: "A season cannot follow itself" };
  }
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_SEASONS.find((s) => s.id === id);
    if (!row) return { success: false, error: "Season not found" };
    if (nextSeasonId !== null) {
      const next = MOCK_COMP_SEASONS.find((s) => s.id === nextSeasonId);
      if (!next) return { success: false, error: "Next season not found" };
    }
    row.next_season_id = nextSeasonId;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_seasons")
    .update({ next_season_id: nextSeasonId })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
