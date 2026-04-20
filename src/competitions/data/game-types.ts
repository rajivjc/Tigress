// =============================================================================
// Competitions — game types (Session 21)
// =============================================================================
// Reference data. Seeded by migration 011; in mock mode the fixture matches
// the seed row-for-row so queries are identical.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_COMP_GAME_TYPES } from "./mock-data";
import type { GameType } from "../types";

export async function listGameTypes(): Promise<GameType[]> {
  if (!isSupabaseConfigured()) {
    return [...MOCK_COMP_GAME_TYPES].sort(
      (a, b) => a.sort_order - b.sort_order
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_game_types")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data as GameType[] | null) ?? [];
}

export async function getGameType(id: string): Promise<GameType | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_GAME_TYPES.find((g) => g.id === id) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_game_types")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as GameType | null) ?? null;
}
