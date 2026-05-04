// =============================================================================
// Competitions — match lineups (S23, extended in S24b1)
// =============================================================================
// Records which member played on which side of a team sub-match. Singles: one
// row per side. Doubles: two rows per side. Validated against the league's
// `lineup.rule`:
//   * strict             — every member must be on the team's roster.
//   * loose              — any active member of the club can play.
//   * sub_with_approval  — roster members go through as `not_required`;
//                          non-roster (but otherwise active club) members are
//                          staged as `pending` and reportSubMatch refuses
//                          to record a result until the opposing captain
//                          (or a manager override) approves them.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listActiveMemberIds } from "./players";
import {
  MOCK_COMP_COMPETITIONS,
  MOCK_COMP_ENTRANTS,
  MOCK_COMP_MATCHES,
  MOCK_COMP_MATCH_LINEUPS,
  MOCK_COMP_TEAM_MEMBERS,
} from "./mock-data";
import type {
  LeagueLineupRule,
  LineupApprovalStatus,
  LineupSide,
  MatchLineup,
} from "../types";

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

/** Result of resolving a single member id under a lineup rule. */
type LineupMemberResolution =
  | { ok: true; status: LineupApprovalStatus }
  | { ok: false; error: string };

function resolveMember(
  memberId: string,
  rule: LeagueLineupRule,
  rosterIds: Set<string>,
  activeMemberIds: Set<string>
): LineupMemberResolution {
  if (rule === "strict") {
    if (!rosterIds.has(memberId)) {
      return {
        ok: false,
        error: "Lineup includes a member not on this team's roster",
      };
    }
    return { ok: true, status: "not_required" };
  }
  if (rule === "loose") {
    if (!activeMemberIds.has(memberId)) {
      return { ok: false, error: "Member is not an active club member" };
    }
    return { ok: true, status: "not_required" };
  }
  // sub_with_approval
  if (rosterIds.has(memberId)) {
    return { ok: true, status: "not_required" };
  }
  if (!activeMemberIds.has(memberId)) {
    return {
      ok: false,
      error:
        "Substitute must be an active club member — archived accounts can't play",
    };
  }
  return { ok: true, status: "pending" };
}

/**
 * Replace the lineup for one side of one match. Clears the existing rows for
 * that (match, side) and inserts the given `memberIds`. `slotKind` comes from
 * the league's sub_match_slots config and determines the required count
 * (1 for singles, 2 for doubles). The `lineupRule` decides how each member
 * resolves — see the resolveMember helper above.
 */
export interface SetLineupInput {
  matchId: string;
  side: LineupSide;
  memberIds: string[];
  slotKind: "singles" | "doubles";
  /** S24b1: defaults to 'strict' for backwards compatibility — callers
   *  passing an explicit rule pick up the new behaviour. */
  lineupRule?: LeagueLineupRule;
}

export interface SetLineupResult {
  success: boolean;
  error?: string;
  /** S24b1: which member ids landed in the `pending` approval state. The
   *  action layer uses this to fire the
   *  `comp.lineup.sub_approval_requested` audit event. */
  pendingMemberIds?: string[];
}

export async function setLineup(input: SetLineupInput): Promise<SetLineupResult> {
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

  const rule: LeagueLineupRule = input.lineupRule ?? "strict";

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

    const rosterIds = new Set(
      MOCK_COMP_TEAM_MEMBERS.filter(
        (tm) => tm.team_id === entrant.entrant_team_id
      ).map((tm) => tm.member_id)
    );
    const activeMemberIds =
      rule === "strict"
        ? new Set<string>()
        : await listActiveMemberIds(input.memberIds);

    const resolutions: { memberId: string; status: LineupApprovalStatus }[] = [];
    for (const memberId of input.memberIds) {
      const res = resolveMember(memberId, rule, rosterIds, activeMemberIds);
      if (!res.ok) return { success: false, error: res.error };
      resolutions.push({ memberId, status: res.status });
    }

    // Clear existing rows for this (match, side), then insert new ones.
    for (let i = MOCK_COMP_MATCH_LINEUPS.length - 1; i >= 0; i--) {
      const row = MOCK_COMP_MATCH_LINEUPS[i]!;
      if (row.match_id === input.matchId && row.side === input.side) {
        MOCK_COMP_MATCH_LINEUPS.splice(i, 1);
      }
    }
    const nowIso = new Date().toISOString();
    const pendingMemberIds: string[] = [];
    for (const r of resolutions) {
      MOCK_COMP_MATCH_LINEUPS.push({
        match_id: input.matchId,
        entrant_id: entrantId,
        member_id: r.memberId,
        side: input.side,
        recorded_at: nowIso,
        approval_status: r.status,
        approved_by_member_id: null,
        approved_at: null,
        approval_note: null,
      });
      if (r.status === "pending") pendingMemberIds.push(r.memberId);
    }
    return { success: true, pendingMemberIds };
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
  const rosterIds = new Set(
    ((rosterRows as { member_id: string }[] | null) ?? []).map((r) => r.member_id)
  );

  const activeMemberIds =
    rule === "strict"
      ? new Set<string>()
      : await listActiveMemberIds(input.memberIds);

  const resolutions: { memberId: string; status: LineupApprovalStatus }[] = [];
  for (const memberId of input.memberIds) {
    const res = resolveMember(memberId, rule, rosterIds, activeMemberIds);
    if (!res.ok) return { success: false, error: res.error };
    resolutions.push({ memberId, status: res.status });
  }

  await supabase
    .from("comp_match_lineups")
    .delete()
    .eq("match_id", input.matchId)
    .eq("side", input.side);
  const insertRows = resolutions.map((r) => ({
    match_id: input.matchId,
    entrant_id: entrantId,
    member_id: r.memberId,
    side: input.side,
    approval_status: r.status,
  }));
  const { error } = await supabase
    .from("comp_match_lineups")
    .insert(insertRows);
  if (error) return { success: false, error: error.message };
  const pendingMemberIds = resolutions
    .filter((r) => r.status === "pending")
    .map((r) => r.memberId);
  return { success: true, pendingMemberIds };
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

/**
 * S24b1: returns true if the (match, side) lineup contains any pending
 * substitution-approval rows. reportSubMatch consults this before recording
 * a result and refuses with LINEUP_PENDING_APPROVAL when set.
 */
export async function hasPendingApproval(matchId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_MATCH_LINEUPS.some(
      (l) => l.match_id === matchId && l.approval_status === "pending"
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_match_lineups")
    .select("match_id")
    .eq("match_id", matchId)
    .eq("approval_status", "pending")
    .limit(1);
  return ((data as { match_id: string }[] | null) ?? []).length > 0;
}

export interface ApproveLineupRowInput {
  matchId: string;
  entrantId: string;
  side: LineupSide;
  decision: "approved" | "rejected";
  approverMemberId: string;
  note: string | null;
}

/**
 * Update every pending lineup row matching (matchId, side, entrantId) to
 * the decided state. Used by the approveLineupSubstitution server action.
 * Returns the list of member ids that were updated so the caller can audit
 * and revalidate.
 */
export async function applyLineupApprovalDecision(
  input: ApproveLineupRowInput
): Promise<{ success: boolean; error?: string; affectedMemberIds: string[] }> {
  const nowIso = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const affected: string[] = [];
    for (const row of MOCK_COMP_MATCH_LINEUPS) {
      if (
        row.match_id === input.matchId &&
        row.entrant_id === input.entrantId &&
        row.side === input.side &&
        row.approval_status === "pending"
      ) {
        row.approval_status = input.decision;
        row.approved_by_member_id = input.approverMemberId;
        row.approved_at = nowIso;
        row.approval_note = input.note;
        affected.push(row.member_id);
      }
    }
    if (affected.length === 0) {
      return {
        success: false,
        error: "No pending substitution found for this side",
        affectedMemberIds: [],
      };
    }
    return { success: true, affectedMemberIds: affected };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("comp_match_lineups")
    .update({
      approval_status: input.decision,
      approved_by_member_id: input.approverMemberId,
      approved_at: nowIso,
      approval_note: input.note,
    })
    .eq("match_id", input.matchId)
    .eq("entrant_id", input.entrantId)
    .eq("side", input.side)
    .eq("approval_status", "pending")
    .select("member_id");
  if (error) {
    return { success: false, error: error.message, affectedMemberIds: [] };
  }
  const affected = ((data as { member_id: string }[] | null) ?? []).map(
    (r) => r.member_id
  );
  if (affected.length === 0) {
    return {
      success: false,
      error: "No pending substitution found for this side",
      affectedMemberIds: [],
    };
  }
  return { success: true, affectedMemberIds: affected };
}

/**
 * S24b1: list every match where the given member is the captain of the
 * OPPOSING side of a pending substitution. Drives the captain-facing
 * `PendingApprovalsList` component on the league detail page. Returns a
 * lightweight projection so the caller can render without further queries.
 */
export interface PendingApprovalRow {
  matchId: string;
  competitionId: string;
  fixtureId: string | null;
  /** Side that the substitution belongs to — i.e. NOT the viewer's side. */
  subSide: LineupSide;
  subEntrantId: string;
  subMemberId: string;
}

export async function listPendingApprovalsForCaptain(
  captainMemberId: string,
  competitionId?: string
): Promise<PendingApprovalRow[]> {
  if (!isSupabaseConfigured()) {
    const out: PendingApprovalRow[] = [];
    for (const row of MOCK_COMP_MATCH_LINEUPS) {
      if (row.approval_status !== "pending") continue;
      const match = MOCK_COMP_MATCHES.find((m) => m.id === row.match_id);
      if (!match) continue;
      if (competitionId && match.competition_id !== competitionId) continue;
      // Find the OPPOSING side's entrant and check its team's captain.
      const opposingEntrantId =
        row.side === "a" ? match.entrant_b_id : match.entrant_a_id;
      if (!opposingEntrantId) continue;
      const opposingEntrant = MOCK_COMP_ENTRANTS.find(
        (e) => e.id === opposingEntrantId
      );
      if (!opposingEntrant?.entrant_team_id) continue;
      const team = await getTeamCaptain(opposingEntrant.entrant_team_id);
      if (team !== captainMemberId) continue;
      out.push({
        matchId: row.match_id,
        competitionId: match.competition_id,
        fixtureId: match.fixture_id,
        subSide: row.side,
        subEntrantId: row.entrant_id,
        subMemberId: row.member_id,
      });
    }
    return out;
  }
  // Real-mode: pull every pending row, then join in memory. Pending rows
  // are rare so this is still cheap; future optimisation could push the
  // captain-equality check into a SQL view.
  const supabase = createClient();
  let query = supabase
    .from("comp_match_lineups")
    .select(
      "match_id, entrant_id, side, member_id, comp_matches!inner(competition_id, entrant_a_id, entrant_b_id, fixture_id)"
    )
    .eq("approval_status", "pending");
  if (competitionId) {
    query = query.eq("comp_matches.competition_id", competitionId);
  }
  const { data } = await query;
  type Row = {
    match_id: string;
    entrant_id: string;
    side: LineupSide;
    member_id: string;
    comp_matches: {
      competition_id: string;
      entrant_a_id: string | null;
      entrant_b_id: string | null;
      fixture_id: string | null;
    };
  };
  const rows = (data as Row[] | null) ?? [];
  const out: PendingApprovalRow[] = [];
  for (const row of rows) {
    const opposingEntrantId =
      row.side === "a"
        ? row.comp_matches.entrant_b_id
        : row.comp_matches.entrant_a_id;
    if (!opposingEntrantId) continue;
    const { data: entrantData } = await supabase
      .from("comp_competition_entrants")
      .select("entrant_team_id")
      .eq("id", opposingEntrantId)
      .maybeSingle();
    const teamId = (entrantData as { entrant_team_id: string | null } | null)
      ?.entrant_team_id;
    if (!teamId) continue;
    const { data: teamData } = await supabase
      .from("comp_teams")
      .select("captain_member_id")
      .eq("id", teamId)
      .maybeSingle();
    const captainId =
      (teamData as { captain_member_id: string | null } | null)
        ?.captain_member_id ?? null;
    if (captainId !== captainMemberId) continue;
    out.push({
      matchId: row.match_id,
      competitionId: row.comp_matches.competition_id,
      fixtureId: row.comp_matches.fixture_id,
      subSide: row.side,
      subEntrantId: row.entrant_id,
      subMemberId: row.member_id,
    });
  }
  return out;
}

async function getTeamCaptain(teamId: string): Promise<string | null> {
  const { MOCK_COMP_TEAMS } = await import("./mock-data");
  return (
    MOCK_COMP_TEAMS.find((t) => t.id === teamId)?.captain_member_id ?? null
  );
}

/** Exported for mock-mode helpers — looks up the competition for a match. */
export function __getCompetitionForMatch(matchId: string): string | null {
  const match = MOCK_COMP_MATCHES.find((m) => m.id === matchId);
  if (!match) return null;
  const comp = MOCK_COMP_COMPETITIONS.find((c) => c.id === match.competition_id);
  return comp?.id ?? null;
}
