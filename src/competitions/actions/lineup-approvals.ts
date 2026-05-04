"use server";

// =============================================================================
// Competitions — substitution approvals (Session 24b1)
// =============================================================================
// When a league runs `lineup.rule = sub_with_approval`, non-roster substitutes
// land in `comp_match_lineups.approval_status = 'pending'` and the
// reportSubMatch action refuses to record a result until they're approved.
// This action is the approval / rejection entry point.
//
// Authorization:
//   * Opposing captain — can approve OR reject any pending sub on the
//     other side. Emits comp.lineup.sub_approved / sub_rejected.
//   * Manager / owner — can override-approve (or reject) any pending sub
//     regardless of side. Emits comp.lineup.sub_override_approved (for
//     approvals); rejections still use comp.lineup.sub_rejected so the
//     verb in the audit log matches the outcome.
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../data/players";
import { getMatch } from "../data/matches";
import { listEntrants } from "../data/entrants";
import { getTeam } from "../data/teams";
import { applyLineupApprovalDecision } from "../data/lineups";
import { writeCompAuditLog } from "../audit";
import type { LineupSide } from "../types";

export interface ApproveLineupSubstitutionInput {
  matchId: string;
  /** The entrant the substitute is playing for. Combined with `side` and
   *  `matchId` this identifies the pending lineup row(s) to update. */
  entrantId: string;
  side: LineupSide;
  decision: "approved" | "rejected";
  note?: string;
}

export async function approveLineupSubstitutionAction(
  input: ApproveLineupSubstitutionInput
): Promise<{ success: boolean; error?: string; affectedMemberIds?: string[] }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };

  const match = await getMatch(input.matchId);
  if (!match) return { success: false, error: "Match not found" };

  // The substitution is for one side; the OPPOSING side's captain (or any
  // manager/owner) is the only authorised approver.
  const subEntrantId = input.entrantId;
  const opposingEntrantId =
    input.side === "a" ? match.entrant_b_id : match.entrant_a_id;
  if (!opposingEntrantId) {
    return { success: false, error: "Match has no opposing entrant" };
  }

  const entrants = await listEntrants(match.competition_id);
  const opposingEntrant = entrants.find((e) => e.id === opposingEntrantId);
  const subEntrant = entrants.find((e) => e.id === subEntrantId);
  if (!opposingEntrant?.entrant_team_id || !subEntrant?.entrant_team_id) {
    return { success: false, error: "Both sides must be team entrants" };
  }

  let isOverride = false;
  if (actor.isManagerOrOwner) {
    isOverride = true;
  } else {
    if (actor.player.kind !== "member") {
      return {
        success: false,
        error: "Only the opposing captain or a manager can decide this",
      };
    }
    const opposingTeam = await getTeam(opposingEntrant.entrant_team_id);
    if (!opposingTeam || opposingTeam.captain_member_id !== actor.player.id) {
      // Block same-side captain explicitly so the error message helps.
      const subTeam = await getTeam(subEntrant.entrant_team_id);
      if (subTeam && subTeam.captain_member_id === actor.player.id) {
        return {
          success: false,
          error:
            "FORBIDDEN: You can't approve your own team's substitution — the opposing captain decides",
        };
      }
      return {
        success: false,
        error: "Only the opposing captain or a manager can decide this",
      };
    }
  }

  const decisionResult = await applyLineupApprovalDecision({
    matchId: input.matchId,
    entrantId: subEntrantId,
    side: input.side,
    decision: input.decision,
    approverMemberId: actor.player.id,
    note: input.note?.trim() ? input.note.trim() : null,
  });
  if (!decisionResult.success) {
    return { success: false, error: decisionResult.error };
  }

  // Audit verb depends on outcome + actor path.
  if (input.decision === "approved") {
    await writeCompAuditLog(
      isOverride
        ? "comp.lineup.sub_override_approved"
        : "comp.lineup.sub_approved",
      input.matchId,
      actor.player.id,
      {
        matchId: input.matchId,
        side: input.side,
        substituteEntrantId: subEntrantId,
        affectedMemberIds: decisionResult.affectedMemberIds,
        note: input.note ?? null,
      }
    );
  } else {
    await writeCompAuditLog(
      "comp.lineup.sub_rejected",
      input.matchId,
      actor.player.id,
      {
        matchId: input.matchId,
        side: input.side,
        substituteEntrantId: subEntrantId,
        affectedMemberIds: decisionResult.affectedMemberIds,
        override: isOverride,
        note: input.note ?? null,
      }
    );
  }

  revalidatePath(`/competitions/${match.competition_id}`);
  return {
    success: true,
    affectedMemberIds: decisionResult.affectedMemberIds,
  };
}
