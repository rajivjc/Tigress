"use server";

// =============================================================================
// Competitions — member self-registration (Session 22)
// =============================================================================
// First member-facing surface. A signed-in member can register for an
// individual tournament during registration_open, and withdraw at any point
// up to (and including) in_progress. Withdrawing mid-tournament forfeits
// every active match via the same walkover path byes use — the opponent
// wins and advances.
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentActor } from "../data/players";
import {
  addEntrant,
  listEntrants,
  removeEntrant,
} from "../data/entrants";
import { getCompetition } from "../data/competitions";
import {
  advanceWinner,
  listBracketMatches,
} from "../data/bracket";
import { recordResult } from "../data/match-results";
import { updateMatchStatus } from "../data/matches";
import {
  MOCK_COMP_ENTRANTS,
  MOCK_COMP_MATCHES,
} from "../data/mock-data";
import { writeCompAuditLog } from "../audit";

export async function registerForTournamentAction(
  competitionId: string
): Promise<{ success: boolean; entrantId?: string; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (actor.player.kind !== "member") {
    return { success: false, error: "Only members can self-register" };
  }

  const comp = await getCompetition(competitionId);
  if (!comp) return { success: false, error: "Competition not found" };
  if (comp.status !== "registration_open") {
    return {
      success: false,
      error: "Registration is not open for this competition",
    };
  }
  if (comp.entrant_type !== "individual") {
    return {
      success: false,
      error: "This competition uses team entrants — join a team instead",
    };
  }

  const memberId = actor.player.id;
  const res = await addEntrant(competitionId, { kind: "member", id: memberId });
  if (!res.success || !res.id) return res;

  await writeCompAuditLog(
    "comp.entrant.self_registered",
    res.id,
    actor.player.id,
    { competitionId, memberId, entrantId: res.id }
  );

  revalidatePath("/competitions");
  revalidatePath(`/competitions/${competitionId}`);
  return { success: true, entrantId: res.id };
}

export async function withdrawFromTournamentAction(
  competitionId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (actor.player.kind !== "member") {
    return { success: false, error: "Only members can withdraw" };
  }

  const comp = await getCompetition(competitionId);
  if (!comp) return { success: false, error: "Competition not found" };
  if (comp.status === "completed" || comp.status === "cancelled") {
    return {
      success: false,
      error: "Competition has already ended",
    };
  }

  const memberId = actor.player.id;
  const entrants = await listEntrants(competitionId);
  const own = entrants.find((e) => e.entrant_member_id === memberId);
  if (!own) return { success: false, error: "You're not registered for this" };

  if (comp.status === "registration_open") {
    // Pre-bracket: just delete.
    const del = await removeEntrant(own.id);
    if (!del.success) return del;
  } else {
    // in_progress: cascade — any active match this member is in becomes a
    // walkover, opponent advances.
    if (!isSupabaseConfigured()) {
      // Mock: set entrant status to withdrawn rather than deleting (matches
      // what the DB policy would allow: UPDATE to status='withdrawn').
      const row = MOCK_COMP_ENTRANTS.find((e) => e.id === own.id);
      if (row) row.status = "withdrawn";
    } else {
      const supabase = createClient();
      await supabase
        .from("comp_competition_entrants")
        .update({ status: "withdrawn" })
        .eq("id", own.id);
    }

    const matches = await listBracketMatches(competitionId);
    for (const m of matches) {
      if (m.status !== "scheduled") continue;
      if (m.entrant_a_id !== own.id && m.entrant_b_id !== own.id) continue;
      if (m.entrant_a_id === null || m.entrant_b_id === null) {
        // Opponent not yet resolved — can't auto-forfeit. Mark walkover
        // without a result; the bracket UI will surface the null half for
        // manager attention.
        if (!isSupabaseConfigured()) {
          const row = MOCK_COMP_MATCHES.find((mm) => mm.id === m.id);
          if (row) row.is_walkover = true;
        }
        continue;
      }
      const opponentId =
        m.entrant_a_id === own.id ? m.entrant_b_id : m.entrant_a_id;
      const scoreA = m.entrant_a_id === opponentId ? m.race_to_a : 0;
      const scoreB = m.entrant_b_id === opponentId ? m.race_to_b : 0;

      await recordResult({
        match_id: m.id,
        winner_entrant_id: opponentId,
        score_a: scoreA,
        score_b: scoreB,
        reported_by_auth_user_id: null,
        flags: { walkover: true, reason: "withdrawn" },
        notes: "Walkover — opponent withdrew",
      });
      await updateMatchStatus(m.id, "completed");
      // Mark the match itself as a walkover for display.
      if (!isSupabaseConfigured()) {
        const row = MOCK_COMP_MATCHES.find((mm) => mm.id === m.id);
        if (row) row.is_walkover = true;
      } else {
        const supabase = createClient();
        await supabase
          .from("comp_matches")
          .update({ is_walkover: true })
          .eq("id", m.id);
      }
      await advanceWinner(m.id);
    }
  }

  await writeCompAuditLog(
    "comp.entrant.self_withdrew",
    own.id,
    actor.player.id,
    { competitionId, memberId, entrantId: own.id, phase: comp.status }
  );

  revalidatePath("/competitions");
  revalidatePath(`/competitions/${competitionId}`);
  return { success: true };
}
