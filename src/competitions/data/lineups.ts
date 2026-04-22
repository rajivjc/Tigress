// =============================================================================
// Competitions — match lineups (Session 23)
// =============================================================================
// Records which member played on which side of a team sub-match. Singles: one
// row per side. Doubles: two rows per side. Validated against the competition
// config's lineup rule (strict for S23).
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_COMP_COMPETITIONS,
  MOCK_COMP_ENTRANTS,
  MOCK_COMP_MATCHES,
  MOCK_COMP_MATCH_LINEUPS,
  MOCK_COMP_TEAM_MEMBERS,
} from "./mock-data";
import type { LineupSide, MatchLineup } from "../types";

export async function getLineup(matchId: string): Promise<MatchLineup[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_MATCH_LINEUPS.filter((l) => l.match_id === matchId)
      .slice()
      .sort((a, b) => {
        if (a.side !== b.side) return a.side.localeCompare(b.side);
        return a.member_id.localeCompare(b.member_id);
      });
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_match_lineups")
    .select("*")
    .eq("match_id", matchId);
  return (data as MatchLineup[] | null) ?? [];
}

/**
 * Replace the lineup for one side of one match. Clears the existing rows for
 * that (match, side) and inserts the given `memberIds`. `slotKind` comes from
 * the league's sub_match_slots config and determines the required count
 * (1 for singles, 2 for doubles).
 *
 * Strict lineup rule (S23): every member must be on the team's roster, and
 * no duplicate member on the same side.
 */
export interface SetLineupInput {
  matchId: string;
  side: LineupSide;
  memberIds: string[];
  slotKind: "singles" | "doubles";
}

export async function setLineup(
  input: SetLineupInput
): Promise<{ success: boolean; error?: string }> {
  const expectedCount = input.slotKind === "singles" ? 1 : 2;
  if (input.memberIds.length !== expectedCount) {
    return {
      success: false,
      error: `${input.slotKind} requires ${expectedCount} player(s)`,
    };
  }
  if (new Set(input.memberIds).size !== input.memberIds.length) {
    return { success: false, error: "Duplicate member in lineup" };
  }

  if (!isSupabaseConfigured()) {
    const match = MOCK_COMP_MATCHES.find((m) => m.id === input.matchId);
    if (!match) return { success: false, error: "Match not found" };
    if (match.status !== "scheduled" && match.status !== "in_progress") {
      return {
        success: false,
        error: "Lineup can only be set before the match completes",
      };
    }
    const entrantId =
      input.side === "a" ? match.entrant_a_id : match.entrant_b_id;
    if (!entrantId) {
      return { success: false, error: "Match side has no entrant" };
    }
    const entrant = MOCK_COMP_ENTRANTS.find((e) => e.id === entrantId);
    if (!entrant || !entrant.entrant_team_id) {
      return { success: false, error: "Side is not a team entrant" };
    }

    // Strict: every member must be on the team roster.
    const roster = new Set(
      MOCK_COMP_TEAM_MEMBERS.filter(
        (tm) => tm.team_id === entrant.entrant_team_id
      ).map((tm) => tm.member_id)
    );
    for (const memberId of input.memberIds) {
      if (!roster.has(memberId)) {
        return {
          success: false,
          error: "Lineup includes a member not on this team's roster",
        };
      }
    }

    // Clear existing rows for this (match, side), then insert new ones.
    for (let i = MOCK_COMP_MATCH_LINEUPS.length - 1; i >= 0; i--) {
      const row = MOCK_COMP_MATCH_LINEUPS[i]!;
      if (row.match_id === input.matchId && row.side === input.side) {
        MOCK_COMP_MATCH_LINEUPS.splice(i, 1);
      }
    }
    const nowIso = new Date().toISOString();
    for (const memberId of input.memberIds) {
      MOCK_COMP_MATCH_LINEUPS.push({
        match_id: input.matchId,
        entrant_id: entrantId,
        member_id: memberId,
        side: input.side,
        recorded_at: nowIso,
      });
    }
    return { success: true };
  }

  const supabase = createClient();
  const { data: matchRow } = await supabase
    .from("comp_matches")
    .select("id, entrant_a_id, entrant_b_id, status, competition_id")
    .eq("id", input.matchId)
    .maybeSingle();
  if (!matchRow) return { success: false, error: "Match not found" };
  const match = matchRow as {
    id: string;
    entrant_a_id: string | null;
    entrant_b_id: string | null;
    status: string;
    competition_id: string;
  };
  if (match.status !== "scheduled" && match.status !== "in_progress") {
    return {
      success: false,
      error: "Lineup can only be set before the match completes",
    };
  }
  const entrantId =
    input.side === "a" ? match.entrant_a_id : match.entrant_b_id;
  if (!entrantId) {
    return { success: false, error: "Match side has no entrant" };
  }
  const { data: entrantRow } = await supabase
    .from("comp_competition_entrants")
    .select("id, entrant_team_id")
    .eq("id", entrantId)
    .maybeSingle();
  if (
    !entrantRow ||
    !(entrantRow as { entrant_team_id: string | null }).entrant_team_id
  ) {
    return { success: false, error: "Side is not a team entrant" };
  }
  const teamId = (entrantRow as { entrant_team_id: string }).entrant_team_id;
  const { data: rosterRows } = await supabase
    .from("comp_team_members")
    .select("member_id")
    .eq("team_id", teamId);
  const roster = new Set(
    ((rosterRows as { member_id: string }[] | null) ?? []).map((r) => r.member_id)
  );
  for (const memberId of input.memberIds) {
    if (!roster.has(memberId)) {
      return {
        success: false,
        error: "Lineup includes a member not on this team's roster",
      };
    }
  }

  // Clear old rows + insert new.
  await supabase
    .from("comp_match_lineups")
    .delete()
    .eq("match_id", input.matchId)
    .eq("side", input.side);
  const insertRows = input.memberIds.map((memberId) => ({
    match_id: input.matchId,
    entrant_id: entrantId,
    member_id: memberId,
    side: input.side,
  }));
  const { error } = await supabase
    .from("comp_match_lineups")
    .insert(insertRows);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function clearLineup(
  matchId: string,
  side: LineupSide
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    for (let i = MOCK_COMP_MATCH_LINEUPS.length - 1; i >= 0; i--) {
      const row = MOCK_COMP_MATCH_LINEUPS[i]!;
      if (row.match_id === matchId && row.side === side) {
        MOCK_COMP_MATCH_LINEUPS.splice(i, 1);
      }
    }
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_match_lineups")
    .delete()
    .eq("match_id", matchId)
    .eq("side", side);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Exported for mock-mode helpers — looks up the competition for a match. */
export function __getCompetitionForMatch(matchId: string): string | null {
  const match = MOCK_COMP_MATCHES.find((m) => m.id === matchId);
  if (!match) return null;
  const comp = MOCK_COMP_COMPETITIONS.find((c) => c.id === match.competition_id);
  return comp?.id ?? null;
}
