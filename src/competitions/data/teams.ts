// =============================================================================
// Competitions — teams (Session 21)
// =============================================================================
// Named teams for league play. Captain is always a member. Archived teams
// remain visible for historical record but are filtered out of the picker.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_COMP_TEAMS } from "./mock-data";
import { TEAM_NAME_MAX, TEAM_NAME_MIN } from "../config";
import type { Team, TeamStatus } from "../types";

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ListTeamsOpts {
  status?: TeamStatus;
}

export async function listTeams(opts: ListTeamsOpts = {}): Promise<Team[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_TEAMS.filter((t) => (opts.status ? t.status === opts.status : true))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  const supabase = createClient();
  let query = supabase.from("comp_teams").select("*").order("name", { ascending: true });
  if (opts.status) query = query.eq("status", opts.status);
  const { data } = await query;
  return (data as Team[] | null) ?? [];
}

export async function getTeam(id: string): Promise<Team | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_TEAMS.find((t) => t.id === id) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_teams")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Team | null) ?? null;
}

export interface CreateTeamInput {
  name: string;
  captain_member_id: string;
}

export async function createTeam(
  input: CreateTeamInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const name = input.name.trim();
  if (name.length < TEAM_NAME_MIN || name.length > TEAM_NAME_MAX) {
    return {
      success: false,
      error: `Team name must be between ${TEAM_NAME_MIN} and ${TEAM_NAME_MAX} characters`,
    };
  }

  const nowIso = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const id = randomId("comp-team");
    MOCK_COMP_TEAMS.push({
      id,
      name,
      captain_member_id: input.captain_member_id,
      status: "active",
      created_at: nowIso,
      updated_at: nowIso,
    });
    return { success: true, id };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("comp_teams")
    .insert({
      name,
      captain_member_id: input.captain_member_id,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, id: (data as { id: string }).id };
}

export async function updateTeam(
  id: string,
  patch: Partial<Pick<Team, "name" | "captain_member_id">>
): Promise<{ success: boolean; error?: string }> {
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < TEAM_NAME_MIN || name.length > TEAM_NAME_MAX) {
      return {
        success: false,
        error: `Team name must be between ${TEAM_NAME_MIN} and ${TEAM_NAME_MAX} characters`,
      };
    }
    patch = { ...patch, name };
  }

  const nowIso = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_TEAMS.find((t) => t.id === id);
    if (!row) return { success: false, error: "Team not found" };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.captain_member_id !== undefined) {
      row.captain_member_id = patch.captain_member_id;
    }
    row.updated_at = nowIso;
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_teams")
    .update(patch)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function archiveTeam(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const nowIso = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_TEAMS.find((t) => t.id === id);
    if (!row) return { success: false, error: "Team not found" };
    row.status = "archived";
    row.updated_at = nowIso;
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_teams")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
