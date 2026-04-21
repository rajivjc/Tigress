// =============================================================================
// Competitions — bracket persistence (Session 22)
// =============================================================================
// Database-side counterpart to `lib/bracket.ts` (pure algorithm). Handles:
//
//   * persistBracket — INSERTs every round's matches at publish time. Round 1
//     byes land as completed walkovers; rounds 2..R land as scheduled
//     placeholders with NULL entrants.
//   * listBracketMatches — fetches every match for a competition, ordered by
//     round/position.
//   * advanceWinner — propagates the winner of a completed match into the
//     downstream match's appropriate slot.
//   * maybeAutoCompleteWalkover — if a match becomes resolvable because one
//     slot was filled by a walkover from the previous round AND the other
//     slot is a bye, auto-complete it.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_COMP_ENTRANTS,
  MOCK_COMP_MATCHES,
  MOCK_COMP_MATCH_RESULTS,
} from "./mock-data";
import {
  generateSingleElimBracket,
  type BracketMatchSpec,
  type SeededEntrant,
} from "../lib/bracket";
import type { Match, MatchResult } from "../types";

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * All matches for a competition, sorted by round then bracket position.
 */
export async function listBracketMatches(
  competitionId: string
): Promise<Match[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_MATCHES.filter(
      (m) => m.competition_id === competitionId
    )
      .slice()
      .sort((a, b) => {
        const ra = a.round_number ?? 0;
        const rb = b.round_number ?? 0;
        if (ra !== rb) return ra - rb;
        const pa = a.bracket_position ?? 0;
        const pb = b.bracket_position ?? 0;
        return pa - pb;
      });
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_matches")
    .select("*")
    .eq("competition_id", competitionId)
    .order("round_number", { ascending: true, nullsFirst: true })
    .order("bracket_position", { ascending: true, nullsFirst: true });
  return (data as Match[] | null) ?? [];
}

export interface PersistBracketOpts {
  gameTypeId: string;
  defaultRaceTo: number;
}

export interface PersistBracketResult {
  success: boolean;
  createdCount?: number;
  error?: string;
}

/**
 * Persist the output of `generateSingleElimBracket` as match rows.
 *
 * Round 1:
 *   - Both entrants real: status='scheduled', is_walkover=false
 *   - One entrant is a bye: status='completed', is_walkover=true,
 *     the non-bye side stored in both slots' source (entrant_a or _b) as
 *     appropriate; the result row is inserted with the non-bye entrant as
 *     winner and score 0–0.
 *
 * Rounds 2..R:
 *   - Both entrants NULL, status='scheduled'. Auto-advance UPDATEs the slots
 *     as feeders resolve.
 *
 * Idempotent-ish: if any matches already exist for the competition, the call
 * is rejected so managers can't accidentally double-publish.
 */
export async function persistBracket(
  competitionId: string,
  seeded: SeededEntrant[],
  opts: PersistBracketOpts
): Promise<PersistBracketResult> {
  // Disallow re-publish.
  const existing = await listBracketMatches(competitionId);
  if (existing.length > 0) {
    return {
      success: false,
      error: "Bracket already published for this competition",
    };
  }

  let specs: BracketMatchSpec[];
  try {
    specs = generateSingleElimBracket(seeded);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const nowIso = new Date().toISOString();

  // Build match rows + walkover result rows before touching the store, so
  // failures don't leave half a bracket behind.
  type BuiltMatch = {
    id: string;
    spec: BracketMatchSpec;
    match: Match;
    walkoverResult: MatchResult | null;
  };
  const built: BuiltMatch[] = [];

  for (const spec of specs) {
    const id = randomId("comp-match");
    const aId = "entrantId" in spec.entrantA ? spec.entrantA.entrantId : null;
    const bId = "entrantId" in spec.entrantB ? spec.entrantB.entrantId : null;

    // Detect first-round walkovers (only applies when exactly one of the
    // two slots is a bye — a match with both sides empty is a round 2+
    // placeholder).
    const hasBye =
      ("kind" in spec.entrantA || "kind" in spec.entrantB) &&
      (aId !== null || bId !== null);
    const isFirstRoundBye = spec.roundNumber === 1 && hasBye;

    const status: Match["status"] = isFirstRoundBye ? "completed" : "scheduled";
    const match: Match = {
      id,
      competition_id: competitionId,
      entrant_a_id: aId,
      entrant_b_id: bId,
      game_type_id: opts.gameTypeId,
      race_to_a: opts.defaultRaceTo,
      race_to_b: opts.defaultRaceTo,
      round_number: spec.roundNumber,
      bracket_position: spec.bracketPosition,
      parent_match_id: null,
      scheduled_at: null,
      booking_id: null,
      status,
      is_walkover: isFirstRoundBye,
      created_at: nowIso,
      updated_at: nowIso,
    };

    let walkoverResult: MatchResult | null = null;
    if (isFirstRoundBye) {
      const winnerId = aId ?? bId!;
      walkoverResult = {
        match_id: id,
        winner_entrant_id: winnerId,
        score_a: aId === winnerId ? 0 : 0,
        score_b: bId === winnerId ? 0 : 0,
        broken_by_entrant_id: null,
        flags: { walkover: true },
        reported_by_auth_user_id: null,
        reported_at: nowIso,
        verified_by_staff_id: null,
        verified_at: null,
        notes: "Walkover — opponent was a bye",
      };
    }

    built.push({ id, spec, match, walkoverResult });
  }

  if (!isSupabaseConfigured()) {
    for (const b of built) {
      MOCK_COMP_MATCHES.push(b.match);
      if (b.walkoverResult) MOCK_COMP_MATCH_RESULTS.push(b.walkoverResult);
    }
    // Propagate first-round walkovers into round 2.
    for (const b of built) {
      if (!b.walkoverResult) continue;
      await advanceWinner(b.id);
    }
    return { success: true, createdCount: built.length };
  }

  const supabase = createClient();
  const matchRows = built.map((b) => ({
    id: b.id,
    competition_id: b.match.competition_id,
    entrant_a_id: b.match.entrant_a_id,
    entrant_b_id: b.match.entrant_b_id,
    game_type_id: b.match.game_type_id,
    race_to_a: b.match.race_to_a,
    race_to_b: b.match.race_to_b,
    round_number: b.match.round_number,
    bracket_position: b.match.bracket_position,
    parent_match_id: b.match.parent_match_id,
    scheduled_at: b.match.scheduled_at,
    booking_id: b.match.booking_id,
    status: b.match.status,
    is_walkover: b.match.is_walkover,
  }));
  const { error: matchErr } = await supabase
    .from("comp_matches")
    .insert(matchRows);
  if (matchErr) return { success: false, error: matchErr.message };

  const resultRows = built
    .filter((b) => b.walkoverResult !== null)
    .map((b) => ({
      match_id: b.id,
      winner_entrant_id: b.walkoverResult!.winner_entrant_id,
      score_a: b.walkoverResult!.score_a,
      score_b: b.walkoverResult!.score_b,
      broken_by_entrant_id: b.walkoverResult!.broken_by_entrant_id,
      flags: b.walkoverResult!.flags,
      reported_by_auth_user_id: null,
      notes: b.walkoverResult!.notes,
    }));
  if (resultRows.length > 0) {
    const { error: resErr } = await supabase
      .from("comp_match_results")
      .insert(resultRows);
    if (resErr) return { success: false, error: resErr.message };
  }

  for (const b of built) {
    if (b.walkoverResult) await advanceWinner(b.id);
  }
  return { success: true, createdCount: built.length };
}

export interface AdvanceWinnerResult {
  success: boolean;
  nextMatchId: string | null;
  error?: string;
}

/**
 * Completes auto-advance for `matchId`: finds the downstream match (round
 * N+1, position ceil(P/2)) by (competition, round, position) and UPDATEs its
 * entrant slot (a if matchId's position is odd, b if even) with the winner.
 *
 * Returns the downstream match id (or null for the final). Also cascades
 * when the downstream match now has both slots filled and one side is a
 * walkover — the caller doesn't have to loop; this method recurses.
 */
export async function advanceWinner(matchId: string): Promise<AdvanceWinnerResult> {
  const match = await loadMatch(matchId);
  if (!match) return { success: false, nextMatchId: null, error: "Match not found" };
  if (match.round_number === null || match.bracket_position === null) {
    // Not a bracket match (e.g. casual).
    return { success: true, nextMatchId: null };
  }

  const result = await loadResult(matchId);
  if (!result) {
    return { success: false, nextMatchId: null, error: "No result to advance" };
  }

  const nextRound = match.round_number + 1;
  const nextPos = Math.ceil(match.bracket_position / 2);
  const slot: "a" | "b" = match.bracket_position % 2 === 1 ? "a" : "b";

  const next = await findMatchAt(match.competition_id, nextRound, nextPos);
  if (!next) {
    // This was the final — no further match to advance into.
    return { success: true, nextMatchId: null };
  }

  // Write the winner into the appropriate slot.
  await writeEntrantSlot(next.id, slot, result.winner_entrant_id);

  // Cascade: if the downstream match is now "complete" by virtue of a
  // walkover (the opponent slot was filled but points at a bye/withdrawn
  // entrant), we'd need further logic — but single-elim byes never span
  // more than one round (seeds > N are only placed in round 1). So in
  // single-elim we never need to auto-complete beyond round 1's walkovers;
  // those already trigger advance when persistBracket runs.
  return { success: true, nextMatchId: next.id };
}

/**
 * If `matchId`'s downstream match now has both slots filled AND one of them
 * is a walkover-victim, auto-complete the downstream match. In single-elim
 * this doesn't fire (byes only live in round 1), but the hook exists so
 * future formats can reuse the advance path.
 */
export async function maybeAutoCompleteWalkover(
  _matchId: string
): Promise<{ autoCompleted: boolean; nextMatchId: string | null }> {
  return { autoCompleted: false, nextMatchId: null };
}

/**
 * Clear the downstream advance triggered by `matchId`. Used by the manager's
 * "clear result" action so overriding an upstream match doesn't leave the
 * downstream slot pointing at the old winner.
 *
 * Walks the chain: if the downstream match itself has a result, clear that
 * too and keep walking.
 */
export async function revertAdvance(
  matchId: string
): Promise<{ success: boolean; clearedMatchIds: string[]; error?: string }> {
  const cleared: string[] = [];
  let current = matchId;
  while (true) {
    const m = await loadMatch(current);
    if (!m || m.round_number === null || m.bracket_position === null) break;
    const nextRound = m.round_number + 1;
    const nextPos = Math.ceil(m.bracket_position / 2);
    const slot: "a" | "b" = m.bracket_position % 2 === 1 ? "a" : "b";
    const next = await findMatchAt(m.competition_id, nextRound, nextPos);
    if (!next) break;
    // Clear the slot the winner flowed into.
    await writeEntrantSlot(next.id, slot, null);
    // If the downstream had its own result, clear it and set status back to
    // scheduled.
    const downstreamResult = await loadResult(next.id);
    if (downstreamResult) {
      await deleteResult(next.id);
      await setMatchStatus(next.id, "scheduled");
      cleared.push(next.id);
      current = next.id;
      continue;
    }
    break;
  }
  return { success: true, clearedMatchIds: cleared };
}

// ---------- Low-level helpers (dual-mode) ----------

async function loadMatch(id: string): Promise<Match | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_MATCHES.find((m) => m.id === id) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Match | null) ?? null;
}

async function loadResult(matchId: string): Promise<MatchResult | null> {
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

async function findMatchAt(
  competitionId: string,
  round: number,
  position: number
): Promise<Match | null> {
  if (!isSupabaseConfigured()) {
    return (
      MOCK_COMP_MATCHES.find(
        (m) =>
          m.competition_id === competitionId &&
          m.round_number === round &&
          m.bracket_position === position
      ) ?? null
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_matches")
    .select("*")
    .eq("competition_id", competitionId)
    .eq("round_number", round)
    .eq("bracket_position", position)
    .maybeSingle();
  return (data as Match | null) ?? null;
}

async function writeEntrantSlot(
  matchId: string,
  slot: "a" | "b",
  entrantId: string | null
): Promise<void> {
  const column = slot === "a" ? "entrant_a_id" : "entrant_b_id";
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_MATCHES.find((m) => m.id === matchId);
    if (!row) return;
    if (column === "entrant_a_id") row.entrant_a_id = entrantId;
    else row.entrant_b_id = entrantId;
    row.updated_at = new Date().toISOString();
    return;
  }
  const supabase = createClient();
  await supabase
    .from("comp_matches")
    .update({ [column]: entrantId })
    .eq("id", matchId);
}

async function setMatchStatus(
  matchId: string,
  status: Match["status"]
): Promise<void> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_MATCHES.find((m) => m.id === matchId);
    if (!row) return;
    row.status = status;
    row.updated_at = new Date().toISOString();
    return;
  }
  const supabase = createClient();
  await supabase
    .from("comp_matches")
    .update({ status })
    .eq("id", matchId);
}

async function deleteResult(matchId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_COMP_MATCH_RESULTS.findIndex((r) => r.match_id === matchId);
    if (idx >= 0) MOCK_COMP_MATCH_RESULTS.splice(idx, 1);
    return;
  }
  const supabase = createClient();
  await supabase.from("comp_match_results").delete().eq("match_id", matchId);
}

/**
 * Delete every match (and every result) for a competition. Used by managers
 * before re-publishing, and by tests. Mock mode mirrors the FK cascade by
 * removing results alongside matches.
 */
export async function clearBracket(
  competitionId: string
): Promise<{ success: boolean; removedCount: number; error?: string }> {
  const existing = await listBracketMatches(competitionId);
  if (existing.length === 0) {
    return { success: true, removedCount: 0 };
  }

  if (!isSupabaseConfigured()) {
    for (let i = MOCK_COMP_MATCHES.length - 1; i >= 0; i--) {
      if (MOCK_COMP_MATCHES[i]!.competition_id !== competitionId) continue;
      const matchId = MOCK_COMP_MATCHES[i]!.id;
      MOCK_COMP_MATCHES.splice(i, 1);
      for (let j = MOCK_COMP_MATCH_RESULTS.length - 1; j >= 0; j--) {
        if (MOCK_COMP_MATCH_RESULTS[j]!.match_id === matchId) {
          MOCK_COMP_MATCH_RESULTS.splice(j, 1);
        }
      }
    }
    return { success: true, removedCount: existing.length };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("comp_matches")
    .delete()
    .eq("competition_id", competitionId);
  if (error) return { success: false, removedCount: 0, error: error.message };
  return { success: true, removedCount: existing.length };
}

/**
 * Load an entrant row by id (mock-safe). Exported for the actions layer to
 * cross-check "this entrant belongs to this competition" before doing
 * sensitive operations.
 */
export function __getMockEntrantForTest(entrantId: string) {
  return MOCK_COMP_ENTRANTS.find((e) => e.id === entrantId) ?? null;
}
