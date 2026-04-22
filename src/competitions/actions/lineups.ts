"use server";

// =============================================================================
// Competitions — lineups server actions (Session 23)
// =============================================================================
// Captain of either side can set their own team's lineup; manager / owner
// can override either side. Strict lineup rule (the only one supported in
// S23): members must be on the team's roster, count must match the slot's
// kind (1 for singles, 2 for doubles).
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
): Promise<{ success: boolean; error?: string }> {
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

  // Infer slot kind from the competition's league_config if not given. For
  // S23 the default is singles.
  let slotKind: "singles" | "doubles" = input.slotKind ?? "singles";
  if (!input.slotKind) {
    const comp = await getCompetition(match.competition_id);
    if (comp?.league_config) {
      // First slot by sort order — pragmatic default for the 1-slot demo.
      const slots = comp.league_config.sub_match_slots
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);
      if (slots[0]) slotKind = slots[0].kind;
    }
  }

  const res = await setLineup({
    matchId: input.matchId,
    side: input.side,
    memberIds: input.memberIds,
    slotKind,
  });
  if (!res.success) return res;

  await writeCompAuditLog("comp.lineup.set", input.matchId, actor.player.id, {
    matchId: input.matchId,
    side: input.side,
    memberIds: input.memberIds,
  });

  revalidatePath(`/competitions/${match.competition_id}`);
  return { success: true };
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
