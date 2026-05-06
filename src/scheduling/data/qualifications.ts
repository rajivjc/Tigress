// =============================================================================
// Scheduling — qualifications data accessor (Session 25)
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_SCHEDULE_QUALIFICATIONS } from "./mock-data";
import { QUALIFICATIONS, type Qualification, type UserQualification } from "../types";

export async function listAllQualifications(): Promise<UserQualification[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_QUALIFICATIONS.slice();
  }
  const supabase = createClient();
  const { data } = await supabase.from("user_qualifications").select("*");
  return (data as UserQualification[] | null) ?? [];
}

export async function getQualificationsForUser(
  userId: string
): Promise<Qualification[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_QUALIFICATIONS.filter((q) => q.user_id === userId).map(
      (q) => q.qualification
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("user_qualifications")
    .select("qualification")
    .eq("user_id", userId);
  return ((data as { qualification: Qualification }[] | null) ?? []).map(
    (r) => r.qualification
  );
}

/**
 * Replaces all qualifications for a user with the supplied list. Any
 * qualifications not in the list are removed; missing ones are added.
 */
export async function setUserQualifications(
  userId: string,
  qualifications: Qualification[]
): Promise<{ success: boolean; error?: string }> {
  // Defensive — strip duplicates and unknown values.
  const dedup = Array.from(
    new Set(qualifications.filter((q) => QUALIFICATIONS.includes(q)))
  );

  if (!isSupabaseConfigured()) {
    // Remove existing rows for this user.
    for (let i = MOCK_SCHEDULE_QUALIFICATIONS.length - 1; i >= 0; i--) {
      if (MOCK_SCHEDULE_QUALIFICATIONS[i].user_id === userId) {
        MOCK_SCHEDULE_QUALIFICATIONS.splice(i, 1);
      }
    }
    for (const q of dedup) {
      MOCK_SCHEDULE_QUALIFICATIONS.push({
        user_id: userId,
        qualification: q,
        created_at: new Date().toISOString(),
      });
    }
    return { success: true };
  }

  const supabase = createClient();
  const { error: deleteErr } = await supabase
    .from("user_qualifications")
    .delete()
    .eq("user_id", userId);
  if (deleteErr) return { success: false, error: deleteErr.message };

  if (dedup.length > 0) {
    const { error: insertErr } = await supabase
      .from("user_qualifications")
      .insert(dedup.map((q) => ({ user_id: userId, qualification: q })));
    if (insertErr) return { success: false, error: insertErr.message };
  }
  return { success: true };
}
