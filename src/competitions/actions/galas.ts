"use server";

// =============================================================================
// Competitions — gala fixture actions (Session 24a)
// =============================================================================
// Manager+ only. Creates multi-team gala fixtures decomposed internally into
// pairwise matchups. The standings engine reads pairings via the league
// loader, so the rest of the league pipeline ignores galas entirely.
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../data/players";
import { listEntrants } from "../data/entrants";
import { getCompetition } from "../data/competitions";
import {
  createGalaFixture,
  getFixture,
} from "../data/fixtures";
import {
  createPairings,
  deletePairingsByFixture,
  listPairingsByFixture,
} from "../data/fixture-pairings";
import { setParticipantsForFixture } from "../data/fixture-participants";
import { generateGalaPairings } from "../lib/schedule";
import { writeCompAuditLog } from "../audit";
import type { Match, MatchResult } from "../types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_COMP_MATCHES,
  MOCK_COMP_MATCH_RESULTS,
} from "../data/mock-data";
import { createClient } from "@/lib/supabase/server";

export interface CreateGalaInput {
  seasonId: string;
  divisionId: string;
  competitionId: string;
  participantTeamIds: string[];
  pairingMode: "gala_round_robin" | "gala_manual";
  scheduledAt?: string;
  notes?: string | null;
}

export interface CreateGalaResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function createGala(input: CreateGalaInput): Promise<CreateGalaResult> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  if (input.participantTeamIds.length < 2) {
    return { success: false, error: "Gala needs at least 2 participants" };
  }
  if (new Set(input.participantTeamIds).size !== input.participantTeamIds.length) {
    return { success: false, error: "Duplicate team in participant list" };
  }

  const competition = await getCompetition(input.competitionId);
  if (!competition) return { success: false, error: "Competition not found" };
  if (competition.kind !== "league") {
    return { success: false, error: "Galas only apply to leagues" };
  }

  const entrants = await listEntrants(input.competitionId);
  const teamToEntrant = new Map<string, string>();
  for (const e of entrants) {
    if (e.entrant_team_id !== null) teamToEntrant.set(e.entrant_team_id, e.id);
  }
  const participantEntrantIds: string[] = [];
  for (const teamId of input.participantTeamIds) {
    const entrantId = teamToEntrant.get(teamId);
    if (!entrantId) {
      return {
        success: false,
        error: `Team ${teamId} is not an active entrant in this competition`,
      };
    }
    participantEntrantIds.push(entrantId);
  }

  const fixture = await createGalaFixture({
    competition_id: input.competitionId,
    fixture_date: input.scheduledAt ?? new Date().toISOString(),
    pairing_mode: input.pairingMode,
    notes: input.notes ?? null,
  });
  if (!fixture.success || !fixture.id) {
    return { success: false, error: fixture.error ?? "Insert failed" };
  }

  const partsRes = await setParticipantsForFixture(
    fixture.id,
    participantEntrantIds
  );
  if (!partsRes.success) {
    return { success: false, error: partsRes.error };
  }

  if (input.pairingMode === "gala_round_robin") {
    const pairings = generateGalaPairings(input.participantTeamIds);
    const created = await createPairings(fixture.id, pairings);
    if (!created.success) {
      return { success: false, error: created.error };
    }
  }

  await writeCompAuditLog(
    "comp.fixture.gala_created",
    fixture.id,
    actor.player.id,
    {
      seasonId: input.seasonId,
      divisionId: input.divisionId,
      competitionId: input.competitionId,
      pairingMode: input.pairingMode,
      participantCount: input.participantTeamIds.length,
    }
  );

  revalidatePath(`/competitions/${input.competitionId}`);
  return { success: true, id: fixture.id };
}

export interface SetGalaManualPairingsInput {
  fixtureId: string;
  pairings: { homeTeamId: string; awayTeamId: string }[];
}

async function listSubMatchesForFixture(fixtureId: string): Promise<Match[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_MATCHES.filter((m) => m.fixture_id === fixtureId);
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_matches")
    .select("*")
    .eq("fixture_id", fixtureId);
  return (data as Match[] | null) ?? [];
}

async function listResultsForMatchIds(matchIds: string[]): Promise<MatchResult[]> {
  if (matchIds.length === 0) return [];
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_MATCH_RESULTS.filter((r) => matchIds.includes(r.match_id));
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_match_results")
    .select("*")
    .in("match_id", matchIds);
  return (data as MatchResult[] | null) ?? [];
}

export async function setGalaManualPairings(
  input: SetGalaManualPairingsInput
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const fixture = await getFixture(input.fixtureId);
  if (!fixture) return { success: false, error: "Fixture not found" };
  if (fixture.pairing_mode !== "gala_manual") {
    return { success: false, error: "Fixture is not a manual gala" };
  }

  // Refuse if any pairing already has a recorded sub-match result. This is
  // a coarse check — once results land, edits go through clear-result first.
  const existingPairings = await listPairingsByFixture(input.fixtureId);
  if (existingPairings.length > 0) {
    const subMatches = await listSubMatchesForFixture(input.fixtureId);
    const subWithPairing = subMatches.filter((m) => m.pairing_id !== null);
    const matchIds = subWithPairing.map((m) => m.id);
    const results = await listResultsForMatchIds(matchIds);
    if (results.length > 0) {
      return {
        success: false,
        error: "Cannot edit pairings — sub-match results already recorded",
      };
    }
  }

  // Validate pairings.
  const seen = new Set<string>();
  for (const p of input.pairings) {
    if (p.homeTeamId === p.awayTeamId) {
      return { success: false, error: "Pairing teams must differ" };
    }
    const key = [p.homeTeamId, p.awayTeamId].sort().join("|");
    if (seen.has(key)) {
      return { success: false, error: "Duplicate pairing in payload" };
    }
    seen.add(key);
  }

  const del = await deletePairingsByFixture(input.fixtureId);
  if (!del.success) return del;

  const created = await createPairings(
    input.fixtureId,
    input.pairings.map((p, i) => ({
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
      pairingOrder: i + 1,
    }))
  );
  if (!created.success) return { success: false, error: created.error };

  await writeCompAuditLog(
    "comp.fixture.gala_pairings_set",
    input.fixtureId,
    actor.player.id,
    {
      fixtureId: input.fixtureId,
      pairingCount: input.pairings.length,
    }
  );

  revalidatePath(`/competitions/${fixture.competition_id}`);
  return { success: true };
}
