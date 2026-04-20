// =============================================================================
// Competitions — competitions (Session 21)
// =============================================================================
// CRUD plus status transitions for the top-level competition row. The
// format/kind constraint and the league-must-be-team constraint are both
// enforced here so mock mode rejects the same bad inputs the DB would.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_COMP_COMPETITIONS,
  MOCK_COMP_ENTRANTS,
  MOCK_COMP_MATCHES,
  MOCK_COMP_MATCH_RESULTS,
} from "./mock-data";
import { COMPETITION_NAME_MAX, COMPETITION_NAME_MIN } from "../config";
import type {
  Competition,
  CompetitionEntrantType,
  CompetitionFormat,
  CompetitionGuestPolicy,
  CompetitionKind,
  CompetitionStatus,
  TeamMatchConfig,
} from "../types";

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ListCompetitionsOpts {
  status?: CompetitionStatus;
  kind?: CompetitionKind;
}

export async function listCompetitions(
  opts: ListCompetitionsOpts = {}
): Promise<Competition[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_COMPETITIONS.filter((c) => {
      if (opts.status && c.status !== opts.status) return false;
      if (opts.kind && c.kind !== opts.kind) return false;
      return true;
    })
      .slice()
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  const supabase = createClient();
  let query = supabase
    .from("comp_competitions")
    .select("*")
    .order("created_at", { ascending: false });
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.kind) query = query.eq("kind", opts.kind);
  const { data } = await query;
  return (data as Competition[] | null) ?? [];
}

export async function getCompetition(
  id: string
): Promise<Competition | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_COMPETITIONS.find((c) => c.id === id) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_competitions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Competition | null) ?? null;
}

export interface CreateCompetitionDraftInput {
  name: string;
  description: string | null;
  kind: CompetitionKind;
  format: CompetitionFormat | null;
  entrant_type: CompetitionEntrantType;
  game_type_id: string;
  guest_policy: CompetitionGuestPolicy;
  team_match_config: TeamMatchConfig | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_by_staff_id: string | null;
}

/**
 * Validate the kind/format/entrant_type matrix. Returns null on success or
 * an error string describing the invariant violated. Kept pure so the
 * server action and the data layer can both call it without duplicating
 * regex-y branches.
 */
export function validateCompetitionShape(
  input: Pick<CreateCompetitionDraftInput, "kind" | "format" | "entrant_type">
): string | null {
  if (input.kind === "tournament" && input.format === null) {
    return "Tournaments require a format";
  }
  if (input.kind !== "tournament" && input.format !== null) {
    return `${input.kind} competitions must not specify a format`;
  }
  if (input.kind === "league" && input.entrant_type !== "team") {
    return "Leagues must use team entrants";
  }
  return null;
}

export async function createCompetitionDraft(
  input: CreateCompetitionDraftInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const name = input.name.trim();
  if (name.length < COMPETITION_NAME_MIN || name.length > COMPETITION_NAME_MAX) {
    return {
      success: false,
      error: `Name must be between ${COMPETITION_NAME_MIN} and ${COMPETITION_NAME_MAX} characters`,
    };
  }

  const shapeError = validateCompetitionShape(input);
  if (shapeError) return { success: false, error: shapeError };

  const nowIso = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const id = randomId("comp");
    MOCK_COMP_COMPETITIONS.push({
      id,
      name,
      description: input.description,
      kind: input.kind,
      format: input.format,
      entrant_type: input.entrant_type,
      game_type_id: input.game_type_id,
      guest_policy: input.guest_policy,
      team_match_config: input.team_match_config,
      status: "draft",
      registration_opens_at: input.registration_opens_at,
      registration_closes_at: input.registration_closes_at,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      created_by_staff_id: input.created_by_staff_id,
      created_at: nowIso,
      updated_at: nowIso,
    });
    return { success: true, id };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("comp_competitions")
    .insert({
      name,
      description: input.description,
      kind: input.kind,
      format: input.format,
      entrant_type: input.entrant_type,
      game_type_id: input.game_type_id,
      guest_policy: input.guest_policy,
      team_match_config: input.team_match_config,
      registration_opens_at: input.registration_opens_at,
      registration_closes_at: input.registration_closes_at,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      created_by_staff_id: input.created_by_staff_id,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, id: (data as { id: string }).id };
}

export async function updateCompetitionStatus(
  id: string,
  status: CompetitionStatus
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_COMPETITIONS.find((c) => c.id === id);
    if (!row) return { success: false, error: "Competition not found" };
    row.status = status;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_competitions")
    .update({ status })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Draft-only deletion. Cascades to entrants, matches, and results (FK
 * `ON DELETE CASCADE`) in real mode; mock mode mirrors that by filtering
 * the arrays in-place.
 */
export async function deleteCompetition(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_COMP_COMPETITIONS.findIndex((c) => c.id === id);
    if (idx < 0) return { success: false, error: "Competition not found" };
    if (MOCK_COMP_COMPETITIONS[idx]!.status !== "draft") {
      return {
        success: false,
        error: "Only draft competitions can be deleted",
      };
    }
    MOCK_COMP_COMPETITIONS.splice(idx, 1);
    // Cascade
    for (let i = MOCK_COMP_ENTRANTS.length - 1; i >= 0; i--) {
      if (MOCK_COMP_ENTRANTS[i]!.competition_id === id) {
        MOCK_COMP_ENTRANTS.splice(i, 1);
      }
    }
    for (let i = MOCK_COMP_MATCHES.length - 1; i >= 0; i--) {
      if (MOCK_COMP_MATCHES[i]!.competition_id === id) {
        const matchId = MOCK_COMP_MATCHES[i]!.id;
        MOCK_COMP_MATCHES.splice(i, 1);
        for (let j = MOCK_COMP_MATCH_RESULTS.length - 1; j >= 0; j--) {
          if (MOCK_COMP_MATCH_RESULTS[j]!.match_id === matchId) {
            MOCK_COMP_MATCH_RESULTS.splice(j, 1);
          }
        }
      }
    }
    return { success: true };
  }

  const supabase = createClient();
  // Double-check draft status so we don't rely on RLS alone for the rule.
  const { data: existing } = await supabase
    .from("comp_competitions")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { success: false, error: "Competition not found" };
  if ((existing as { status: string }).status !== "draft") {
    return {
      success: false,
      error: "Only draft competitions can be deleted",
    };
  }

  const { error } = await supabase
    .from("comp_competitions")
    .delete()
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
