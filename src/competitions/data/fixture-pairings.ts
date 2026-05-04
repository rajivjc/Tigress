// =============================================================================
// Competitions — gala fixture pairings (Session 24a)
// =============================================================================
// Pairwise matchups inside a gala fixture. For 2-team fixtures this table is
// unused; for galas every sub-match references a pairing via Match.pairing_id.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_COMP_FIXTURE_PAIRINGS } from "./mock-data";
import type { FixturePairing } from "../types";

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listPairingsByFixture(
  fixtureId: string
): Promise<FixturePairing[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_FIXTURE_PAIRINGS.filter((p) => p.fixture_id === fixtureId)
      .slice()
      .sort((a, b) => a.pairing_order - b.pairing_order);
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_fixture_pairings")
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("pairing_order", { ascending: true });
  return (data as FixturePairing[] | null) ?? [];
}

export interface CreatePairingInput {
  homeTeamId: string;
  awayTeamId: string;
  pairingOrder: number;
}

export async function createPairings(
  fixtureId: string,
  pairings: CreatePairingInput[]
): Promise<{ success: boolean; rows?: FixturePairing[]; error?: string }> {
  if (pairings.length === 0) return { success: true, rows: [] };

  // Reject duplicate (home, away) pairs in the payload — DB has a unique
  // constraint per fixture but we want a clean message in mock + real.
  const seen = new Set<string>();
  for (const p of pairings) {
    if (p.homeTeamId === p.awayTeamId) {
      return { success: false, error: "Pairing teams must differ" };
    }
    const key = `${p.homeTeamId}|${p.awayTeamId}`;
    if (seen.has(key)) {
      return { success: false, error: "Duplicate pairing in payload" };
    }
    seen.add(key);
  }

  if (!isSupabaseConfigured()) {
    const nowIso = new Date().toISOString();
    const rows: FixturePairing[] = pairings.map((p) => ({
      id: randomId("comp-pairing"),
      fixture_id: fixtureId,
      home_team_id: p.homeTeamId,
      away_team_id: p.awayTeamId,
      pairing_order: p.pairingOrder,
      created_at: nowIso,
    }));
    MOCK_COMP_FIXTURE_PAIRINGS.push(...rows);
    return { success: true, rows };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("comp_fixture_pairings")
    .insert(
      pairings.map((p) => ({
        fixture_id: fixtureId,
        home_team_id: p.homeTeamId,
        away_team_id: p.awayTeamId,
        pairing_order: p.pairingOrder,
      }))
    )
    .select("*");
  if (error) return { success: false, error: error.message };
  return { success: true, rows: (data as FixturePairing[] | null) ?? [] };
}

export async function deletePairingsByFixture(
  fixtureId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    for (let i = MOCK_COMP_FIXTURE_PAIRINGS.length - 1; i >= 0; i--) {
      if (MOCK_COMP_FIXTURE_PAIRINGS[i]!.fixture_id === fixtureId) {
        MOCK_COMP_FIXTURE_PAIRINGS.splice(i, 1);
      }
    }
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_fixture_pairings")
    .delete()
    .eq("fixture_id", fixtureId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
