// =============================================================================
// Competitions — team members / rosters (Session 21)
// =============================================================================
// Current state only. Removing a member is a hard delete — historical
// lineups for completed matches live on the match rows themselves (added
// when S23 wires up team-night sub-match resolution).
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_COMP_TEAM_MEMBERS } from "./mock-data";
import type { TeamMember } from "../types";

export async function listRoster(teamId: string): Promise<TeamMember[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_TEAM_MEMBERS.filter((tm) => tm.team_id === teamId).slice();
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_team_members")
    .select("*")
    .eq("team_id", teamId)
    .order("added_at", { ascending: true });
  return (data as TeamMember[] | null) ?? [];
}

export async function addToRoster(
  teamId: string,
  memberId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const already = MOCK_COMP_TEAM_MEMBERS.some(
      (tm) => tm.team_id === teamId && tm.member_id === memberId
    );
    if (already) return { success: false, error: "Member already on roster" };
    MOCK_COMP_TEAM_MEMBERS.push({
      team_id: teamId,
      member_id: memberId,
      added_at: new Date().toISOString(),
    });
    return { success: true };
  }

  const supabase = createClient();
  const { error } = await supabase.from("comp_team_members").insert({
    team_id: teamId,
    member_id: memberId,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function removeFromRoster(
  teamId: string,
  memberId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_COMP_TEAM_MEMBERS.findIndex(
      (tm) => tm.team_id === teamId && tm.member_id === memberId
    );
    if (idx < 0) return { success: false, error: "Roster entry not found" };
    MOCK_COMP_TEAM_MEMBERS.splice(idx, 1);
    return { success: true };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("comp_team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("member_id", memberId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
