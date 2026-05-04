"use server";

// =============================================================================
// Competitions — lineups server actions (S23, extended in S24b1)
// =============================================================================
// Captain of either side can set their own team's lineup; manager / owner can
// override either side. The league's `lineup.rule` decides what's accepted:
//   * strict             — roster-only.
//   * loose              — any active member.
//   * sub_with_approval  — non-roster active members go through as `pending`,
//                          unblocked by the opposing captain via
//                          `approveLineupSubstitutionAction`.
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../data/players";
import { getCompetition } from "../data/competitions";
import { getMatch } from "../data/matches";
import { listEntrants } from "../data/entrants";
import { getTeam } from "../data/teams";
import { clearLineup, setLineup } from "../data/lineups";
import { writeCompAuditLog } from "../audit";
import type { LineupSide } from "../types";

export interface SetLineupActionInput {
  matchId: string;
  side: LineupSide;
  memberIds: string[];
  /** Optional override — otherwise the slot kind is inferred from the
   *  league's config via sort order of sub-matches in the fixture. If the
   *  caller can't compute it, default to "singles". */
  slotKind?: "singles" | "doubles";
}

export async function setLineupAction(
  input: SetLineupActionInput
): Promise<{ success: boolean; error?: string; pendingMemberIds?: string[] }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };

  const match = await getMatch(input.matchId);
  if (!match) return { success: false, error: "Match not found" };

  // Authorise: captain of THIS team on THIS side, OR manager/owner.
  const entrantId =
    input.side === "a" ? match.entrant_a_id : match.entrant_b_id;
  if (!entrantId) {
    return { success: false, error: "Match side has no entrant" };
  }

  if (!actor.isManagerOrOwner) {
    if (actor.player.kind !== "member") {
      return { success: false, error: "Captain or manager role required" };
    }
    const entrants = await listEntrants(match.competition_id);
    const entrant = entrants.find((e) => e.id === entrantId);
    if (!entrant || !entrant.entrant_team_id) {
      return { success: false, error: "Side is not a team entrant" };
    }
    const team = await getTeam(entrant.entrant_team_id);
    if (!team || team.captain_member_id !== actor.player.id) {
      return {
        success: false,
        error: "Only this team's captain or a manager can set this lineup",
      };
    }
  }

  // Pull the competition once to derive both slot kind and lineup rule.
  const comp = await getCompetition(match.competition_id);
  let slotKind: "singles" | "doubles" = input.slotKind ?? "singles";
  if (!input.slotKind && comp?.league_config) {
    const slots = comp.league_config.sub_match_slots
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    if (slots[0]) slotKind = slots[0].kind;
  }
  const lineupRule = comp?.league_config?.lineup.rule ?? "strict";

  const res = await setLineup({
    matchId: input.matchId,
    side: input.side,
    memberIds: input.memberIds,
    slotKind,
    lineupRule,
  });
  if (!res.success) return res;

  await writeCompAuditLog("comp.lineup.set", input.matchId, actor.player.id, {
    matchId: input.matchId,
    side: input.side,
    memberIds: input.memberIds,
    lineupRule,
  });

  // Stage one approval-request audit per pending substitute. Real-mode
  // captains pick this up via `listPendingApprovalsForCaptain`.
  const pendingMemberIds = res.pendingMemberIds ?? [];
  for (const memberId of pendingMemberIds) {
    await writeCompAuditLog(
      "comp.lineup.sub_approval_requested",
      input.matchId,
      actor.player.id,
      {
        matchId: input.matchId,
        side: input.side,
        substituteMemberId: memberId,
      }
    );
  }

  revalidatePath(`/competitions/${match.competition_id}`);
  return { success: true, pendingMemberIds };
}

export async function clearLineupAction(
  matchId: string,
  side: LineupSide
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };

  const match = await getMatch(matchId);
  if (!match) return { success: false, error: "Match not found" };
  if (match.status !== "scheduled") {
    return {
      success: false,
      error: "Lineups can only be cleared before the match starts",
    };
  }

  const entrantId = side === "a" ? match.entrant_a_id : match.entrant_b_id;
  if (!entrantId) {
    return { success: false, error: "Match side has no entrant" };
  }

  if (!actor.isManagerOrOwner) {
    if (actor.player.kind !== "member") {
      return { success: false, error: "Captain or manager role required" };
    }
    const entrants = await listEntrants(match.competition_id);
    const entrant = entrants.find((e) => e.id === entrantId);
    if (!entrant || !entrant.entrant_team_id) {
      return { success: false, error: "Side is not a team entrant" };
    }
    const team = await getTeam(entrant.entrant_team_id);
    if (!team || team.captain_member_id !== actor.player.id) {
      return {
        success: false,
        error: "Only this team's captain or a manager can clear this lineup",
      };
    }
  }

  const res = await clearLineup(matchId, side);
  if (!res.success) return res;

  await writeCompAuditLog("comp.lineup.cleared", matchId, actor.player.id, {
    matchId,
    side,
  });

  revalidatePath(`/competitions/${match.competition_id}`);
  return { success: true };
}
