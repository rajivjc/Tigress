// =============================================================================
// Competitions — player skills (Session 21)
// =============================================================================
// Displayed 1..10 skill level per member. Informational only — handicap is
// applied manually on each match's `race_to_a` / `race_to_b`.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_COMP_PLAYER_SKILLS } from "./mock-data";
import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from "../config";
import type { PlayerSkill } from "../types";

export async function getSkillLevel(memberId: string): Promise<number | null> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_PLAYER_SKILLS.find((s) => s.member_id === memberId);
    return row?.skill_level ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_player_skills")
    .select("skill_level")
    .eq("member_id", memberId)
    .maybeSingle();
  if (!data) return null;
  return (data as { skill_level: number }).skill_level;
}

export async function listSkillLevels(): Promise<PlayerSkill[]> {
  if (!isSupabaseConfigured()) {
    return [...MOCK_COMP_PLAYER_SKILLS];
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_player_skills")
    .select("*");
  return (data as PlayerSkill[] | null) ?? [];
}

export async function setSkillLevel(
  memberId: string,
  level: number,
  actorStaffId: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!Number.isInteger(level)) {
    return { success: false, error: "Skill level must be an integer" };
  }
  if (level < SKILL_LEVEL_MIN || level > SKILL_LEVEL_MAX) {
    return {
      success: false,
      error: `Skill level must be between ${SKILL_LEVEL_MIN} and ${SKILL_LEVEL_MAX}`,
    };
  }

  const nowIso = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const idx = MOCK_COMP_PLAYER_SKILLS.findIndex(
      (s) => s.member_id === memberId
    );
    if (idx >= 0) {
      MOCK_COMP_PLAYER_SKILLS[idx] = {
        member_id: memberId,
        skill_level: level,
        updated_by_staff_id: actorStaffId,
        updated_at: nowIso,
      };
    } else {
      MOCK_COMP_PLAYER_SKILLS.push({
        member_id: memberId,
        skill_level: level,
        updated_by_staff_id: actorStaffId,
        updated_at: nowIso,
      });
    }
    return { success: true };
  }

  const supabase = createClient();
  const { error } = await supabase.from("comp_player_skills").upsert({
    member_id: memberId,
    skill_level: level,
    updated_by_staff_id: actorStaffId,
    updated_at: nowIso,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
