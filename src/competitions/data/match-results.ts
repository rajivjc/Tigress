// =============================================================================
// Competitions — match results (Session 21)
// =============================================================================
// One row per completed match. Separate table so in-flight matches don't
// carry unused score fields. PK on match_id guarantees single-result.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_COMP_MATCHES,
  MOCK_COMP_MATCH_RESULTS,
} from "./mock-data";
import type { MatchResult } from "../types";

/**
 * Load every result row for a competition in one batched query. Replaces the
 * per-match dynamic import loop the detail page used to run.
 */
export async function listResultsForCompetition(
  competitionId: string
): Promise<MatchResult[]> {
  if (!isSupabaseConfigured()) {
    const matchIds = new Set(
      MOCK_COMP_MATCHES.filter((m) => m.competition_id === competitionId).map(
        (m) => m.id
      )
    );
    return MOCK_COMP_MATCH_RESULTS.filter((r) => matchIds.has(r.match_id));
  }
  const supabase = createClient();
  const { data: matchRows } = await supabase
    .from("comp_matches")
    .select("id")
    .eq("competition_id", competitionId);
  const ids = ((matchRows as { id: string }[] | null) ?? []).map((r) => r.id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("comp_match_results")
    .select("*")
    .in("match_id", ids);
  return (data as MatchResult[] | null) ?? [];
}

export async function getResult(matchId: string): Promise<MatchResult | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_MATCH_RESULTS.find((r) => r.match_id === matchId) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_match_results")
    .select("*")
    .eq("match_id", matchId)
    .maybeSingle();
  return (data as MatchResult | null) ?? null;
}

export interface RecordResultInput {
  match_id: string;
  winner_entrant_id: string;
  score_a: number;
  score_b: number;
  broken_by_entrant_id?: string | null;
  flags?: Record<string, unknown>;
  reported_by_auth_user_id: string | null;
  notes?: string | null;
}

export async function recordResult(
  input: RecordResultInput
): Promise<{ success: boolean; error?: string }> {
  if (!Number.isInteger(input.score_a) || input.score_a < 0) {
    return { success: false, error: "score_a must be a non-negative integer" };
  }
  if (!Number.isInteger(input.score_b) || input.score_b < 0) {
    return { success: false, error: "score_b must be a non-negative integer" };
  }

  const nowIso = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const match = MOCK_COMP_MATCHES.find((m) => m.id === input.match_id);
    if (!match) return { success: false, error: "Match not found" };

    if (
      input.winner_entrant_id !== match.entrant_a_id &&
      input.winner_entrant_id !== match.entrant_b_id
    ) {
      return {
        success: false,
        error: "Winner must be one of the match entrants",
      };
    }

    const existingIdx = MOCK_COMP_MATCH_RESULTS.findIndex(
      (r) => r.match_id === input.match_id
    );
    const row: MatchResult = {
      match_id: input.match_id,
      winner_entrant_id: input.winner_entrant_id,
      score_a: input.score_a,
      score_b: input.score_b,
      broken_by_entrant_id: input.broken_by_entrant_id ?? null,
      flags: input.flags ?? {},
      reported_by_auth_user_id: input.reported_by_auth_user_id,
      reported_at: nowIso,
      verified_by_staff_id: null,
      verified_at: null,
      notes: input.notes ?? null,
    };
    if (existingIdx >= 0) {
      MOCK_COMP_MATCH_RESULTS[existingIdx] = row;
    } else {
      MOCK_COMP_MATCH_RESULTS.push(row);
    }
    // Moving a match to completed is a separate action call — we just
    // record the result here.
    return { success: true };
  }

  const supabase = createClient();
  const { error } = await supabase.from("comp_match_results").upsert({
    match_id: input.match_id,
    winner_entrant_id: input.winner_entrant_id,
    score_a: input.score_a,
    score_b: input.score_b,
    broken_by_entrant_id: input.broken_by_entrant_id ?? null,
    flags: input.flags ?? {},
    reported_by_auth_user_id: input.reported_by_auth_user_id,
    reported_at: nowIso,
    notes: input.notes ?? null,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function verifyResult(
  matchId: string,
  staffId: string
): Promise<{ success: boolean; error?: string }> {
  const nowIso = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_MATCH_RESULTS.find((r) => r.match_id === matchId);
    if (!row) return { success: false, error: "Result not found" };
    row.verified_by_staff_id = staffId;
    row.verified_at = nowIso;
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_match_results")
    .update({
      verified_by_staff_id: staffId,
      verified_at: nowIso,
    })
    .eq("match_id", matchId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function clearResult(
  matchId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_COMP_MATCH_RESULTS.findIndex((r) => r.match_id === matchId);
    if (idx < 0) return { success: false, error: "Result not found" };
    MOCK_COMP_MATCH_RESULTS.splice(idx, 1);
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_match_results")
    .delete()
    .eq("match_id", matchId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
