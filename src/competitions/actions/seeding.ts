"use server";

// =============================================================================
// Competitions — seeding actions (Session 22)
// =============================================================================
// Manager / owner bulk-assigns seed numbers before a bracket is published.
// The existing `setSeedNumbers` data-layer function already enforces the DB
// unique index + intra-payload uniqueness — these actions layer auth on top.
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../data/players";
import { getCompetition } from "../data/competitions";
import { listEntrants, setSeedNumbers } from "../data/entrants";

export interface SeedingEntry {
  entrantId: string;
  seedNumber: number | null;
}

export async function setSeedingAction(
  competitionId: string,
  seeds: SeedingEntry[]
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const comp = await getCompetition(competitionId);
  if (!comp) return { success: false, error: "Competition not found" };
  if (comp.status !== "registration_open" && comp.status !== "draft") {
    return {
      success: false,
      error: "Seeding can only change while registration is open",
    };
  }

  const map: Record<string, number | null> = {};
  for (const s of seeds) map[s.entrantId] = s.seedNumber;
  const res = await setSeedNumbers(competitionId, map);
  if (!res.success) return res;

  revalidatePath(`/competitions/${competitionId}`);
  return { success: true };
}

/**
 * Shuffle active entrants and stamp 1..N in a random order. Uses Fisher–Yates
 * over a copy of the entrant list, then calls setSeedNumbers with the
 * resulting mapping.
 */
export async function randomSeedAction(
  competitionId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const comp = await getCompetition(competitionId);
  if (!comp) return { success: false, error: "Competition not found" };
  if (comp.status !== "registration_open" && comp.status !== "draft") {
    return {
      success: false,
      error: "Seeding can only change while registration is open",
    };
  }

  const entrants = await listEntrants(competitionId);
  const active = entrants.filter((e) => e.status === "active");
  const order = active.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }

  // Two-phase assignment: first null out every seed (so we don't clash with
  // an existing seed while re-stamping), then write the new order.
  const clear: Record<string, number | null> = {};
  for (const e of active) clear[e.id] = null;
  const clearRes = await setSeedNumbers(competitionId, clear);
  if (!clearRes.success) return clearRes;

  const map: Record<string, number | null> = {};
  order.forEach((e, i) => {
    map[e.id] = i + 1;
  });
  const res = await setSeedNumbers(competitionId, map);
  if (!res.success) return res;

  revalidatePath(`/competitions/${competitionId}`);
  return { success: true };
}
