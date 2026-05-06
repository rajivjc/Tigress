// =============================================================================
// Scheduling — PT availability submissions (Session 25)
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_SCHEDULE_AVAILABILITY } from "./mock-data";
import type { AvailabilityBlock } from "../types";

const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function getAvailabilityForUser(
  userId: string,
  weekStartDate: string
): Promise<AvailabilityBlock[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_AVAILABILITY.filter(
      (b) => b.user_id === userId && b.week_start_date === weekStartDate
    ).sort((a, b) => {
      if (a.day_of_week !== b.day_of_week) {
        return a.day_of_week - b.day_of_week;
      }
      return a.start_time.localeCompare(b.start_time);
    });
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_availability")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start_date", weekStartDate)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });
  return (data as AvailabilityBlock[] | null) ?? [];
}

export async function getAvailabilityForWeek(
  weekStartDate: string
): Promise<AvailabilityBlock[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_AVAILABILITY.filter(
      (b) => b.week_start_date === weekStartDate
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_availability")
    .select("*")
    .eq("week_start_date", weekStartDate);
  return (data as AvailabilityBlock[] | null) ?? [];
}

export interface AvailabilityBlockInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
  note?: string | null;
}

/**
 * Replaces all availability blocks for (user, week) with the supplied list.
 * Atomic in mock mode; in real mode the delete + insert run sequentially —
 * any partial failure is reported via the return error.
 */
export async function replaceAvailability(
  userId: string,
  weekStartDate: string,
  blocks: AvailabilityBlockInput[]
): Promise<{ success: boolean; error?: string }> {
  for (const b of blocks) {
    if (b.day_of_week < 0 || b.day_of_week > 6) {
      return { success: false, error: "day_of_week must be 0..6" };
    }
    if (b.end_time <= b.start_time) {
      return { success: false, error: "end_time must be after start_time" };
    }
  }

  if (!isSupabaseConfigured()) {
    for (let i = MOCK_SCHEDULE_AVAILABILITY.length - 1; i >= 0; i--) {
      const row = MOCK_SCHEDULE_AVAILABILITY[i];
      if (row.user_id === userId && row.week_start_date === weekStartDate) {
        MOCK_SCHEDULE_AVAILABILITY.splice(i, 1);
      }
    }
    for (const b of blocks) {
      MOCK_SCHEDULE_AVAILABILITY.push({
        id: id("schedule-availability"),
        user_id: userId,
        week_start_date: weekStartDate,
        day_of_week: b.day_of_week,
        start_time: b.start_time,
        end_time: b.end_time,
        note: b.note ?? null,
        created_at: new Date().toISOString(),
      });
    }
    return { success: true };
  }

  const supabase = createClient();
  const { error: deleteErr } = await supabase
    .from("schedule_availability")
    .delete()
    .eq("user_id", userId)
    .eq("week_start_date", weekStartDate);
  if (deleteErr) return { success: false, error: deleteErr.message };

  if (blocks.length > 0) {
    const { error: insertErr } = await supabase
      .from("schedule_availability")
      .insert(
        blocks.map((b) => ({
          user_id: userId,
          week_start_date: weekStartDate,
          day_of_week: b.day_of_week,
          start_time: b.start_time,
          end_time: b.end_time,
          note: b.note ?? null,
        }))
      );
    if (insertErr) return { success: false, error: insertErr.message };
  }
  return { success: true };
}

export async function clearAvailability(
  userId: string,
  weekStartDate: string
): Promise<{ success: boolean; error?: string }> {
  return replaceAvailability(userId, weekStartDate, []);
}
