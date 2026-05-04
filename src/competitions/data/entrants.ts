// =============================================================================
// Competitions — entrants (Session 21)
// =============================================================================
// Polymorphic entrants: exactly one of (member, guest, team) per row. The
// data layer enforces the same uniqueness + XOR invariants the DB has so
// mock mode behaves identically.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_COMP_ENTRANTS } from "./mock-data";
import {
  entrantRowToPlayerRef,
  getPlayersByRefs,
  playerRefToEntrantColumns,
  type EntrantRef,
} from "./players";
import { getTeamsByIds } from "./teams";
import type {
  CompetitionEntrant,
  EnrichedEntrant,
  EntrantSubject,
  Player,
  PlayerRef,
} from "../types";

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listEntrants(
  competitionId: string
): Promise<CompetitionEntrant[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_ENTRANTS.filter((e) => e.competition_id === competitionId)
      .slice()
      .sort((a, b) => {
        if (a.seed_number !== null && b.seed_number !== null) {
          return a.seed_number - b.seed_number;
        }
        if (a.seed_number !== null) return -1;
        if (b.seed_number !== null) return 1;
        return a.registered_at.localeCompare(b.registered_at);
      });
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_competition_entrants")
    .select("*")
    .eq("competition_id", competitionId)
    .order("seed_number", { ascending: true, nullsFirst: false })
    .order("registered_at", { ascending: true });
  return (data as CompetitionEntrant[] | null) ?? [];
}

/**
 * Fetches entrants and resolves the subject (member/guest/team) for each
 * using the Player adapter's batch resolver. Keeps N+1 away from the list
 * page even on real Supabase.
 */
export async function listEntrantsEnriched(
  competitionId: string
): Promise<EnrichedEntrant[]> {
  const entrants = await listEntrants(competitionId);

  const playerRefs: PlayerRef[] = [];
  const teamIds: string[] = [];
  for (const e of entrants) {
    const ref = entrantRowToPlayerRef(e);
    if (!ref) continue;
    if (ref.kind === "team") {
      teamIds.push(ref.id);
    } else {
      playerRefs.push(ref);
    }
  }

  const playerMap = await getPlayersByRefs(playerRefs);

  // S24b2: one batched query for every team id, replacing the previous
  // `Promise.all(teamIds.map(getTeam))` loop the S22 audit flagged.
  const teamMap = await getTeamsByIds(teamIds);

  const captainRefs: PlayerRef[] = Array.from(teamMap.values()).map((t) => ({
    kind: "member",
    id: t.captain_member_id,
  }));
  const captainMap = captainRefs.length > 0 ? await getPlayersByRefs(captainRefs) : new Map<string, Player>();

  return entrants.map((entrant) => {
    const ref = entrantRowToPlayerRef(entrant);
    let subject: EntrantSubject | null = null;
    if (ref) {
      if (ref.kind === "team") {
        const team = teamMap.get(ref.id);
        if (team) {
          subject = {
            kind: "team",
            team,
            captain: captainMap.get(`member:${team.captain_member_id}`) ?? null,
          };
        }
      } else {
        const player = playerMap.get(`${ref.kind}:${ref.id}`);
        if (player) subject = { kind: "player", player };
      }
    }
    return { entrant, subject };
  });
}

export interface AddEntrantResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function addEntrant(
  competitionId: string,
  ref: EntrantRef
): Promise<AddEntrantResult> {
  if (!isSupabaseConfigured()) {
    // Uniqueness per-competition per-subject
    const dup = MOCK_COMP_ENTRANTS.find((e) => {
      if (e.competition_id !== competitionId) return false;
      if (ref.kind === "member" && e.entrant_member_id === ref.id) return true;
      if (ref.kind === "guest" && e.entrant_guest_id === ref.id) return true;
      if (ref.kind === "team" && e.entrant_team_id === ref.id) return true;
      return false;
    });
    if (dup) {
      return { success: false, error: "Already registered for this competition" };
    }
    const id = randomId("comp-entrant");
    const columns = playerRefToEntrantColumns(ref);
    MOCK_COMP_ENTRANTS.push({
      id,
      competition_id: competitionId,
      entrant_member_id: columns.entrant_member_id,
      entrant_guest_id: columns.entrant_guest_id,
      entrant_team_id: columns.entrant_team_id,
      seed_number: null,
      status: "active",
      registered_at: new Date().toISOString(),
    });
    return { success: true, id };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("comp_competition_entrants")
    .insert({
      competition_id: competitionId,
      ...playerRefToEntrantColumns(ref),
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, id: (data as { id: string }).id };
}

export async function removeEntrant(
  entrantId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_COMP_ENTRANTS.findIndex((e) => e.id === entrantId);
    if (idx < 0) return { success: false, error: "Entrant not found" };
    MOCK_COMP_ENTRANTS.splice(idx, 1);
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_competition_entrants")
    .delete()
    .eq("id", entrantId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Bulk-assign seed numbers. Payload maps entrantId → seed (or null to
 * clear). Validates uniqueness inside the payload; DB / mock enforces
 * uniqueness against any rows not in the payload.
 */
export async function setSeedNumbers(
  competitionId: string,
  map: Record<string, number | null>
): Promise<{ success: boolean; error?: string }> {
  const seeds = Object.values(map).filter((v): v is number => v !== null);
  const set = new Set(seeds);
  if (set.size !== seeds.length) {
    return { success: false, error: "Duplicate seed numbers in payload" };
  }

  if (!isSupabaseConfigured()) {
    // Check conflict with existing rows not in the payload.
    for (const e of MOCK_COMP_ENTRANTS) {
      if (e.competition_id !== competitionId) continue;
      if (map[e.id] !== undefined) continue;
      if (e.seed_number !== null && set.has(e.seed_number)) {
        return { success: false, error: `Seed ${e.seed_number} already taken` };
      }
    }
    for (const [entrantId, seed] of Object.entries(map)) {
      const row = MOCK_COMP_ENTRANTS.find((e) => e.id === entrantId);
      if (!row) continue;
      row.seed_number = seed;
    }
    return { success: true };
  }

  const supabase = createClient();
  for (const [entrantId, seed] of Object.entries(map)) {
    const { error } = await supabase
      .from("comp_competition_entrants")
      .update({ seed_number: seed })
      .eq("id", entrantId)
      .eq("competition_id", competitionId);
    if (error) return { success: false, error: error.message };
  }
  return { success: true };
}
