"use server";

// =============================================================================
// Competitions — bracket-publish actions (Session 22)
// =============================================================================
// Manager / owner only. Auto-seeds unseeded entrants by registration order,
// generates a single-elim bracket, persists every match, and transitions
// the competition to in_progress.
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentActor } from "../data/players";
import { listEntrants, setSeedNumbers } from "../data/entrants";
import { getCompetition, updateCompetitionStatus } from "../data/competitions";
import { clearBracket, persistBracket } from "../data/bracket";
import { DEFAULT_RACE_TO_BY_GAME_TYPE } from "../config";
import { writeCompAuditLog } from "../audit";
import { MOCK_COMP_COMPETITIONS } from "../data/mock-data";
import type { SeededEntrant } from "../lib/bracket";

export interface PublishBracketOpts {
  gameTypeId?: string;
  defaultRaceTo?: number;
}

export async function publishBracketAction(
  competitionId: string,
  opts: PublishBracketOpts = {}
): Promise<{ success: boolean; createdCount?: number; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const comp = await getCompetition(competitionId);
  if (!comp) return { success: false, error: "Competition not found" };
  if (comp.status !== "registration_open") {
    return {
      success: false,
      error: "Bracket can only be published while registration is open",
    };
  }
  if (comp.kind !== "tournament" || comp.format !== "single_elim") {
    return {
      success: false,
      error: "Only single-elim tournaments are supported in S22",
    };
  }
  if (comp.entrant_type !== "individual") {
    return {
      success: false,
      error: "Individual entrants only (team brackets land in S23)",
    };
  }

  const entrants = await listEntrants(competitionId);
  const active = entrants.filter((e) => e.status === "active");
  if (active.length < 2) {
    return {
      success: false,
      error: "At least 2 active entrants required",
    };
  }

  // Auto-seed by registration order when no seeds are set (or when seeds
  // are partial — stamp a contiguous 1..N over the registration ordering).
  const hasAllSeeds = active.every((e) => e.seed_number !== null);
  const uniqueSeeds = new Set(
    active.filter((e) => e.seed_number !== null).map((e) => e.seed_number)
  );
  const seedsUnique = uniqueSeeds.size === active.filter((e) => e.seed_number !== null).length;

  let seeded: SeededEntrant[];
  if (hasAllSeeds && seedsUnique) {
    seeded = active
      .slice()
      .sort((a, b) => (a.seed_number ?? 0) - (b.seed_number ?? 0))
      .map((e, i) => ({
        entrantId: e.id,
        seedNumber: i + 1, // normalise to 1..N in case seeds were 2, 5, 7
      }));
  } else {
    // Auto-seed by registration order.
    const sorted = active
      .slice()
      .sort((a, b) => a.registered_at.localeCompare(b.registered_at));
    const seedMap: Record<string, number | null> = {};
    seeded = sorted.map((e, i) => {
      seedMap[e.id] = i + 1;
      return { entrantId: e.id, seedNumber: i + 1 };
    });
    const seedRes = await setSeedNumbers(competitionId, seedMap);
    if (!seedRes.success) return seedRes;
  }

  const gameTypeId = opts.gameTypeId ?? comp.game_type_id;
  const defaultRaceTo =
    opts.defaultRaceTo ??
    DEFAULT_RACE_TO_BY_GAME_TYPE[gameTypeId] ??
    5;

  const persist = await persistBracket(competitionId, seeded, {
    gameTypeId,
    defaultRaceTo,
  });
  if (!persist.success) return persist;

  // Transition to in_progress.
  const status = await updateCompetitionStatus(competitionId, "in_progress");
  if (!status.success) return status;

  await writeCompAuditLog(
    "comp.bracket.published",
    competitionId,
    actor.player.id,
    {
      competitionId,
      matchCount: persist.createdCount ?? 0,
      entrantCount: active.length,
    }
  );

  revalidatePath("/competitions");
  revalidatePath(`/competitions/${competitionId}`);
  return { success: true, createdCount: persist.createdCount };
}

/**
 * Manager / owner wipes the bracket and kicks the competition back to
 * registration_open. Intended for mistakes during the first minute after
 * publishing — doesn't touch entrants, only matches + results.
 */
export async function clearBracketAction(
  competitionId: string
): Promise<{ success: boolean; removedCount?: number; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const comp = await getCompetition(competitionId);
  if (!comp) return { success: false, error: "Competition not found" };
  if (comp.status === "completed") {
    return {
      success: false,
      error: "Cannot clear a completed competition's bracket",
    };
  }

  const res = await clearBracket(competitionId);
  if (!res.success) return res;

  // Put the competition back to registration_open so managers can re-seed
  // or add entrants before re-publishing.
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_COMPETITIONS.find((c) => c.id === competitionId);
    if (row) row.status = "registration_open";
  } else {
    const supabase = createClient();
    await supabase
      .from("comp_competitions")
      .update({ status: "registration_open" })
      .eq("id", competitionId);
  }

  await writeCompAuditLog(
    "comp.bracket.cleared",
    competitionId,
    actor.player.id,
    { competitionId, removedMatchCount: res.removedCount }
  );

  revalidatePath("/competitions");
  revalidatePath(`/competitions/${competitionId}`);
  return { success: true, removedCount: res.removedCount };
}
