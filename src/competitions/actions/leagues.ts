"use server";

// =============================================================================
// Competitions — create-league action (Session 23)
// =============================================================================
// Bundles competition creation with division assignment and league_config.
// Validates the config against the implemented-features list before
// persisting; rejects with a clear feature-named error if the caller picked
// an unsupported value.
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../data/players";
import { createCompetitionDraft } from "../data/competitions";
import { getDivision } from "../data/divisions";
import { getSeason } from "../data/seasons";
import { writeCompAuditLog } from "../audit";
import {
  LeagueConfigNotImplementedError,
  validateLeagueConfigSupported,
} from "../lib/standings";
import type {
  CompetitionGuestPolicy,
  LeagueConfig,
  TeamMatchConfig,
} from "../types";

export interface CreateLeagueActionInput {
  name: string;
  description: string | null;
  divisionId: string;
  gameTypeId: string;
  guestPolicy: CompetitionGuestPolicy;
  teamMatchConfig: TeamMatchConfig;
  leagueConfig: LeagueConfig;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  startsAt?: string | null;
}

export async function createLeagueCompetitionAction(
  input: CreateLeagueActionInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  if (!input.divisionId) {
    return { success: false, error: "Division is required for a league" };
  }
  const division = await getDivision(input.divisionId);
  if (!division) return { success: false, error: "Division not found" };
  const season = await getSeason(division.season_id);
  if (!season) return { success: false, error: "Division has no season" };
  if (season.status === "archived") {
    return {
      success: false,
      error: "Cannot create a league in an archived season",
    };
  }

  try {
    validateLeagueConfigSupported(input.leagueConfig);
  } catch (err) {
    if (err instanceof LeagueConfigNotImplementedError) {
      return {
        success: false,
        error: `League config not yet supported: ${err.feature}`,
      };
    }
    throw err;
  }

  const staffId = actor.player.kind === "staff" ? actor.player.id : null;

  const result = await createCompetitionDraft({
    name: input.name,
    description: input.description,
    kind: "league",
    format: null,
    entrant_type: "team",
    game_type_id: input.gameTypeId,
    guest_policy: input.guestPolicy,
    team_match_config: input.teamMatchConfig,
    division_id: input.divisionId,
    league_config: input.leagueConfig,
    registration_opens_at: input.registrationOpensAt ?? null,
    registration_closes_at: input.registrationClosesAt ?? null,
    starts_at: input.startsAt ?? null,
    ends_at: null,
    created_by_staff_id: staffId,
  });
  if (!result.success || !result.id) {
    return { success: false, error: result.error ?? "Failed to create league" };
  }

  await writeCompAuditLog("comp.league.created", result.id, staffId, {
    competitionId: result.id,
    divisionId: input.divisionId,
    seasonId: division.season_id,
  });

  revalidatePath("/competitions");
  revalidatePath("/leagues");
  return { success: true, id: result.id };
}
