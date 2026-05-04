// =============================================================================
// Competitions — gala fixture pairings (Session 24a)
// =============================================================================
// Pairwise matchups inside a gala fixture. For 2-team fixtures this table is
// unused; for galas every sub-match references a pairing via Match.pairing_id.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_COMP_FIXTURE_PAIRINGS,
  MOCK_COMP_MATCHES,
  MOCK_COMP_MATCH_LINEUPS,
  MOCK_COMP_MATCH_RESULTS,
} from "./mock-data";
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

/**
 * Batched variant of `listPairingsByFixture` — single round trip for all
 * fixtures in a competition. Used by the standings loader to avoid N+1
 * queries when a league has many gala fixtures.
 */
export async function listPairingsByFixtureIds(
  fixtureIds: string[]
): Promise<Map<string, FixturePairing[]>> {
  const out = new Map<string, FixturePairing[]>();
  if (fixtureIds.length === 0) return out;
  if (!isSupabaseConfigured()) {
    const idSet = new Set(fixtureIds);
    for (const p of MOCK_COMP_FIXTURE_PAIRINGS) {
      if (!idSet.has(p.fixture_id)) continue;
      const arr = out.get(p.fixture_id) ?? [];
      arr.push(p);
      out.set(p.fixture_id, arr);
    }
    for (const arr of out.values()) {
      arr.sort((a, b) => a.pairing_order - b.pairing_order);
    }
    return out;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_fixture_pairings")
    .select("*")
    .in("fixture_id", fixtureIds)
    .order("pairing_order", { ascending: true });
  for (const row of (data as FixturePairing[] | null) ?? []) {
    const arr = out.get(row.fixture_id) ?? [];
    arr.push(row);
    out.set(row.fixture_id, arr);
  }
  return out;
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
    // Mirror the real schema's FK chain — pairing → matches (via pairing_id
    // ON DELETE CASCADE) → lineups + results (via match_id ON DELETE CASCADE).
    const pairingIds = new Set<string>();
    for (let i = MOCK_COMP_FIXTURE_PAIRINGS.length - 1; i >= 0; i--) {
      if (MOCK_COMP_FIXTURE_PAIRINGS[i]!.fixture_id === fixtureId) {
        pairingIds.add(MOCK_COMP_FIXTURE_PAIRINGS[i]!.id);
        MOCK_COMP_FIXTURE_PAIRINGS.splice(i, 1);
      }
    }
    const matchIds = new Set<string>();
    for (let i = MOCK_COMP_MATCHES.length - 1; i >= 0; i--) {
      const pid = MOCK_COMP_MATCHES[i]!.pairing_id;
      if (pid !== null && pairingIds.has(pid)) {
        matchIds.add(MOCK_COMP_MATCHES[i]!.id);
        MOCK_COMP_MATCHES.splice(i, 1);
      }
    }
    for (let i = MOCK_COMP_MATCH_LINEUPS.length - 1; i >= 0; i--) {
      if (matchIds.has(MOCK_COMP_MATCH_LINEUPS[i]!.match_id)) {
        MOCK_COMP_MATCH_LINEUPS.splice(i, 1);
      }
    }
    for (let i = MOCK_COMP_MATCH_RESULTS.length - 1; i >= 0; i--) {
      if (matchIds.has(MOCK_COMP_MATCH_RESULTS[i]!.match_id)) {
        MOCK_COMP_MATCH_RESULTS.splice(i, 1);
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
