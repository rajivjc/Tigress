// =============================================================================
// Competitions — divisions (Session 23)
// =============================================================================
// A division belongs to (season, league_name, tier). league_name is a text
// field — leagues are conceptual, identified by name reuse across seasons so
// S24's promotion/relegation can wire them together.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_COMP_COMPETITIONS,
  MOCK_COMP_DIVISIONS,
  MOCK_COMP_SEASONS,
} from "./mock-data";
import type { Division } from "../types";

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ListDivisionsOpts {
  seasonId?: string;
}

export async function listDivisions(
  opts: ListDivisionsOpts = {}
): Promise<Division[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_DIVISIONS.filter((d) => {
      if (opts.seasonId && d.season_id !== opts.seasonId) return false;
      return true;
    })
      .slice()
      .sort((a, b) => {
        const ln = a.league_name.localeCompare(b.league_name);
        if (ln !== 0) return ln;
        return a.tier - b.tier;
      });
  }
  const supabase = createClient();
  let query = supabase
    .from("comp_divisions")
    .select("*")
    .order("league_name", { ascending: true })
    .order("tier", { ascending: true });
  if (opts.seasonId) query = query.eq("season_id", opts.seasonId);
  const { data } = await query;
  return (data as Division[] | null) ?? [];
}

export async function getDivision(id: string): Promise<Division | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_DIVISIONS.find((d) => d.id === id) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_divisions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Division | null) ?? null;
}

export interface CreateDivisionInput {
  season_id: string;
  league_name: string;
  tier: number;
  tier_name: string;
}

export async function createDivision(
  input: CreateDivisionInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const leagueName = input.league_name.trim();
  const tierName = input.tier_name.trim();
  if (leagueName.length < 1 || leagueName.length > 80) {
    return { success: false, error: "League name must be 1–80 characters" };
  }
  if (tierName.length < 1 || tierName.length > 40) {
    return { success: false, error: "Tier name must be 1–40 characters" };
  }
  if (!Number.isInteger(input.tier) || input.tier < 1 || input.tier > 10) {
    return { success: false, error: "Tier must be an integer between 1 and 10" };
  }

  if (!isSupabaseConfigured()) {
    const season = MOCK_COMP_SEASONS.find((s) => s.id === input.season_id);
    if (!season) return { success: false, error: "Season not found" };
    const dup = MOCK_COMP_DIVISIONS.find(
      (d) =>
        d.season_id === input.season_id &&
        d.league_name === leagueName &&
        d.tier === input.tier
    );
    if (dup) {
      return {
        success: false,
        error: "A division already exists at this tier for this league + season",
      };
    }
    const id = randomId("comp-division");
    MOCK_COMP_DIVISIONS.push({
      id,
      season_id: input.season_id,
      league_name: leagueName,
      tier: input.tier,
      tier_name: tierName,
      created_at: new Date().toISOString(),
    });
    return { success: true, id };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("comp_divisions")
    .insert({
      season_id: input.season_id,
      league_name: leagueName,
      tier: input.tier,
      tier_name: tierName,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, id: (data as { id: string }).id };
}

/**
 * Only deletable if no competition references it. Real mode relies on the FK
 * `ON DELETE RESTRICT` to enforce this; mock mode mirrors the check.
 */
export async function deleteDivision(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_COMP_DIVISIONS.findIndex((d) => d.id === id);
    if (idx < 0) return { success: false, error: "Division not found" };
    const referenced = MOCK_COMP_COMPETITIONS.some(
      (c) => c.division_id === id
    );
    if (referenced) {
      return {
        success: false,
        error: "Cannot delete a division that a competition references",
      };
    }
    MOCK_COMP_DIVISIONS.splice(idx, 1);
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_divisions")
    .delete()
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
