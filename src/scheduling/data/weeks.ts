// =============================================================================
// Scheduling — week + shift data accessors (Session 25)
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_SCHEDULE_SHIFTS,
  MOCK_SCHEDULE_WEEKS,
} from "./mock-data";
import { listFtAssignments } from "./ft-assignments";
import { listDayCoverage, listShiftTemplates } from "./templates";
import { materializeFTAssignments } from "../lib/materialize";
import type {
  DraftShift,
  Qualification,
  ScheduleShift,
  ScheduleWeek,
  WeekStatus,
} from "../types";

const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

// ---------- Weeks ----------

export async function listWeeks(): Promise<ScheduleWeek[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_WEEKS.slice().sort((a, b) =>
      a.week_start_date.localeCompare(b.week_start_date)
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_weeks")
    .select("*")
    .order("week_start_date", { ascending: true });
  return (data as ScheduleWeek[] | null) ?? [];
}

export async function getWeek(weekId: string): Promise<ScheduleWeek | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_WEEKS.find((w) => w.id === weekId) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_weeks")
    .select("*")
    .eq("id", weekId)
    .maybeSingle();
  return (data as ScheduleWeek | null) ?? null;
}

export async function getWeekByStartDate(
  weekStartDate: string
): Promise<ScheduleWeek | null> {
  if (!isSupabaseConfigured()) {
    return (
      MOCK_SCHEDULE_WEEKS.find((w) => w.week_start_date === weekStartDate) ??
      null
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_weeks")
    .select("*")
    .eq("week_start_date", weekStartDate)
    .maybeSingle();
  return (data as ScheduleWeek | null) ?? null;
}

/**
 * Creates a draft week and materialises FT standing assignments into shifts.
 * No-ops when a week already exists for that start date — returns the
 * existing row instead.
 */
export async function createWeek(
  weekStartDate: string
): Promise<{ success: boolean; week?: ScheduleWeek; error?: string }> {
  const existing = await getWeekByStartDate(weekStartDate);
  if (existing) return { success: true, week: existing };

  const [templates, dayCoverage, ftAssignments] = await Promise.all([
    listShiftTemplates(),
    listDayCoverage(),
    listFtAssignments(),
  ]);

  const draftShifts = materializeFTAssignments({
    weekStartDate,
    ftAssignments,
    templates,
    dayCoverage,
  });

  if (!isSupabaseConfigured()) {
    // Mock-mode atomicity: snapshot the shift array up-front so we can
    // roll back the week + any partially-pushed shifts if the carry-over
    // push throws. Mirrors the real-mode schedule_create_week RPC's
    // transactional guarantee so tests with throw-injection see a clean
    // post-failure state.
    const newWeek: ScheduleWeek = {
      id: id("schedule-week"),
      week_start_date: weekStartDate,
      status: "draft",
      published_at: null,
      published_by: null,
      publish_override_note: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    const beforeShifts = MOCK_SCHEDULE_SHIFTS.slice();
    MOCK_SCHEDULE_WEEKS.push(newWeek);
    try {
      pushDraftsToMock(newWeek.id, draftShifts);
      return { success: true, week: newWeek };
    } catch (err) {
      // Rollback: drop the week row and restore shift array to its prior state.
      MOCK_SCHEDULE_WEEKS.pop();
      MOCK_SCHEDULE_SHIFTS.length = 0;
      MOCK_SCHEDULE_SHIFTS.push(...beforeShifts);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Create week failed",
      };
    }
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("schedule_create_week", {
    p_week_start_date: weekStartDate,
    p_drafts: draftShifts.map(serialiseDraftShift),
  });
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, week: data as ScheduleWeek };
}

function serialiseDraftShift(d: DraftShift): Record<string, string | null> {
  return {
    template_id: d.template_id,
    shift_date: d.shift_date,
    start_time: d.start_time,
    end_time: d.end_time,
    role: d.role,
    user_id: d.user_id ?? null,
  };
}

function pushDraftsToMock(weekId: string, drafts: DraftShift[]): void {
  for (const d of drafts) {
    MOCK_SCHEDULE_SHIFTS.push({
      id: id("schedule-shift"),
      week_id: weekId,
      template_id: d.template_id,
      shift_date: d.shift_date,
      start_time: d.start_time,
      end_time: d.end_time,
      user_id: d.user_id,
      role: d.role,
      notes: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }
}

/**
 * Creates a new draft week starting from the previous week's shifts.
 * Manual assignments are copied where the user still has the right
 * qualification. FT-derived rows come from materialiseFTAssignments and
 * carryovers come from previous-week shifts shifted +7 days. Real mode runs
 * inside one transaction via schedule_copy_from_previous_week so a partial
 * failure can't leave a dangling week.
 */
export async function copyFromPreviousWeek(
  newWeekStartDate: string,
  previousWeekStartDate: string,
  qualificationsByUser: Map<string, Qualification[]>
): Promise<{ success: boolean; week?: ScheduleWeek; error?: string }> {
  const existing = await getWeekByStartDate(newWeekStartDate);
  if (existing) return { success: true, week: existing };

  const previous = await getWeekByStartDate(previousWeekStartDate);
  if (!previous) {
    return { success: false, error: "Previous week not found" };
  }

  const [templates, dayCoverage, ftAssignments, previousShifts] =
    await Promise.all([
      listShiftTemplates(),
      listDayCoverage(),
      listFtAssignments(),
      listShiftsForWeek(previous.id),
    ]);

  const ftDrafts = materializeFTAssignments({
    weekStartDate: newWeekStartDate,
    ftAssignments,
    templates,
    dayCoverage,
  });

  // Build the carryover list: same shape as DraftShift, dates shifted +7.
  // Skip rows that overlap an FT-derived draft on (user_id, template_id,
  // shift_date) — those are already in `ftDrafts` and would otherwise
  // double-count.
  const ftKey = new Set(
    ftDrafts.map(
      (d) => `${d.user_id ?? ""}::${d.template_id}::${d.shift_date}`
    )
  );
  const ms = 24 * 60 * 60 * 1000 * 7;
  const carryovers: DraftShift[] = [];
  for (const shift of previousShifts) {
    if (!shift.user_id) continue;
    const userQuals = qualificationsByUser.get(shift.user_id) ?? [];
    if (!userQuals.includes(shift.role)) continue;
    const [y, m, d] = shift.shift_date.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d) + ms);
    const newDate = `${next.getUTCFullYear()}-${String(
      next.getUTCMonth() + 1
    ).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
    if (ftKey.has(`${shift.user_id}::${shift.template_id}::${newDate}`)) {
      continue;
    }
    carryovers.push({
      template_id: shift.template_id,
      shift_date: newDate,
      start_time: shift.start_time,
      end_time: shift.end_time,
      user_id: shift.user_id,
      role: shift.role,
    });
  }

  if (!isSupabaseConfigured()) {
    return atomicMockCreate(newWeekStartDate, [...ftDrafts, ...carryovers]);
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "schedule_copy_from_previous_week",
    {
      p_new_ws: newWeekStartDate,
      p_prev_ws: previousWeekStartDate,
      p_drafts: ftDrafts.map(serialiseDraftShift),
      p_carryovers: carryovers.map(serialiseDraftShift),
    }
  );
  if (error || !data) {
    return { success: false, error: error?.message ?? "Copy failed" };
  }
  return { success: true, week: data as ScheduleWeek };
}

/**
 * Atomic mock-mode equivalent of schedule_create_week / copy_from_previous.
 * Either every row lands or none of them do — emulates the SQL transaction.
 */
function atomicMockCreate(
  weekStartDate: string,
  drafts: DraftShift[]
): { success: boolean; week?: ScheduleWeek; error?: string } {
  const newWeek: ScheduleWeek = {
    id: id("schedule-week"),
    week_start_date: weekStartDate,
    status: "draft",
    published_at: null,
    published_by: null,
    publish_override_note: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const newShifts = drafts.map((d) => ({
    id: id("schedule-shift"),
    week_id: newWeek.id,
    template_id: d.template_id,
    shift_date: d.shift_date,
    start_time: d.start_time,
    end_time: d.end_time,
    user_id: d.user_id,
    role: d.role,
    notes: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));
  // Snapshot for throw-rollback so a partial failure during the carry-over
  // push leaves the global state untouched. Mirrors the real-mode RPC's
  // transactional guarantee.
  const beforeWeeks = MOCK_SCHEDULE_WEEKS.slice();
  const beforeShifts = MOCK_SCHEDULE_SHIFTS.slice();
  try {
    MOCK_SCHEDULE_WEEKS.push(newWeek);
    for (const s of newShifts) MOCK_SCHEDULE_SHIFTS.push(s);
    return { success: true, week: newWeek };
  } catch (err) {
    MOCK_SCHEDULE_WEEKS.length = 0;
    MOCK_SCHEDULE_WEEKS.push(...beforeWeeks);
    MOCK_SCHEDULE_SHIFTS.length = 0;
    MOCK_SCHEDULE_SHIFTS.push(...beforeShifts);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Copy failed",
    };
  }
}

// ---------- Shifts ----------

export async function listShiftsForWeek(
  weekId: string
): Promise<ScheduleShift[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_SHIFTS.filter((s) => s.week_id === weekId)
      .slice()
      .sort((a, b) => {
        if (a.shift_date !== b.shift_date) {
          return a.shift_date.localeCompare(b.shift_date);
        }
        return a.start_time.localeCompare(b.start_time);
      });
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_shifts")
    .select("*")
    .eq("week_id", weekId)
    .order("shift_date", { ascending: true })
    .order("start_time", { ascending: true });
  return (data as ScheduleShift[] | null) ?? [];
}

export async function listShiftsForUserInDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<ScheduleShift[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_SHIFTS.filter(
      (s) =>
        s.user_id === userId &&
        s.shift_date >= startDate &&
        s.shift_date <= endDate
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_shifts")
    .select("*")
    .eq("user_id", userId)
    .gte("shift_date", startDate)
    .lte("shift_date", endDate);
  return (data as ScheduleShift[] | null) ?? [];
}

export async function listShiftsForDate(
  shiftDate: string,
  userId: string
): Promise<ScheduleShift[]> {
  return listShiftsForUserInDateRange(userId, shiftDate, shiftDate);
}

/**
 * Returns assigned shifts in published weeks whose scheduled start falls in
 * [windowStartIso, windowEndIso). Used by the 1h-pre-shift push cron.
 *
 * Mock mode evaluates the SGT-anchored start of each shift (date + start
 * time) and filters in-memory. Real mode delegates the date filter to
 * Postgres and applies the time-of-day check after the fetch — comparing
 * (date, time) tuples to UTC instants is a transcoding job that's clearer
 * in app code than in SQL.
 */
export async function listShiftsStartingInWindow(
  windowStartIso: string,
  windowEndIso: string
): Promise<ScheduleShift[]> {
  const startMs = Date.parse(windowStartIso);
  const endMs = Date.parse(windowEndIso);
  const inWindow = (s: ScheduleShift): boolean => {
    const [y, m, d] = s.shift_date.split("-").map(Number);
    const [hh = "0", mm = "0", ss = "0"] = s.start_time.split(":");
    const startUtcMs =
      Date.UTC(
        y,
        m - 1,
        d,
        Number.parseInt(hh, 10),
        Number.parseInt(mm, 10),
        Number.parseInt(ss, 10)
      ) - 8 * 60 * 60 * 1000;
    return startUtcMs >= startMs && startUtcMs < endMs;
  };

  if (!isSupabaseConfigured()) {
    const publishedIds = new Set(
      MOCK_SCHEDULE_WEEKS.filter((w) => w.status === "published").map(
        (w) => w.id
      )
    );
    return MOCK_SCHEDULE_SHIFTS.filter(
      (s) =>
        s.user_id !== null && publishedIds.has(s.week_id) && inWindow(s)
    );
  }
  const supabase = createClient();
  // Pull a slightly wider date range than the strict window so the
  // time-of-day filter has the rows it needs.
  const dayStart = new Date(startMs - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const dayEnd = new Date(endMs + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { data } = await supabase
    .from("schedule_shifts")
    .select("*, schedule_weeks!inner(status)")
    .eq("schedule_weeks.status", "published")
    .gte("shift_date", dayStart)
    .lte("shift_date", dayEnd)
    .not("user_id", "is", null);
  const rows = (data as ScheduleShift[] | null) ?? [];
  return rows.filter(inWindow);
}

export async function getShift(
  shiftId: string
): Promise<ScheduleShift | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_SHIFTS.find((s) => s.id === shiftId) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_shifts")
    .select("*")
    .eq("id", shiftId)
    .maybeSingle();
  return (data as ScheduleShift | null) ?? null;
}

export interface AddShiftInput {
  weekId: string;
  templateId: string;
  shiftDate: string;
  role: Qualification;
  startTime: string;
  endTime: string;
  userId?: string | null;
}

export async function addShift(
  input: AddShiftInput
): Promise<{ success: boolean; shiftId?: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    const newRow: ScheduleShift = {
      id: id("schedule-shift"),
      week_id: input.weekId,
      template_id: input.templateId,
      shift_date: input.shiftDate,
      start_time: input.startTime,
      end_time: input.endTime,
      user_id: input.userId ?? null,
      role: input.role,
      notes: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    MOCK_SCHEDULE_SHIFTS.push(newRow);
    return { success: true, shiftId: newRow.id };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_shifts")
    .insert({
      week_id: input.weekId,
      template_id: input.templateId,
      shift_date: input.shiftDate,
      start_time: input.startTime,
      end_time: input.endTime,
      user_id: input.userId ?? null,
      role: input.role,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, shiftId: (data as { id: string }).id };
}

export async function setShiftUser(
  shiftId: string,
  userId: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_SCHEDULE_SHIFTS.find((s) => s.id === shiftId);
    if (!row) return { success: false, error: "Shift not found" };
    row.user_id = userId;
    row.updated_at = nowIso();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_shifts")
    .update({ user_id: userId })
    .eq("id", shiftId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function setShiftTimes(
  shiftId: string,
  startTime: string,
  endTime: string
): Promise<{ success: boolean; error?: string }> {
  if (endTime <= startTime) {
    return { success: false, error: "end_time must be after start_time" };
  }
  if (!isSupabaseConfigured()) {
    const row = MOCK_SCHEDULE_SHIFTS.find((s) => s.id === shiftId);
    if (!row) return { success: false, error: "Shift not found" };
    row.start_time = startTime;
    row.end_time = endTime;
    row.updated_at = nowIso();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_shifts")
    .update({ start_time: startTime, end_time: endTime })
    .eq("id", shiftId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function removeShift(
  shiftId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_SCHEDULE_SHIFTS.findIndex((s) => s.id === shiftId);
    if (idx === -1) return { success: false, error: "Shift not found" };
    MOCK_SCHEDULE_SHIFTS.splice(idx, 1);
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_shifts")
    .delete()
    .eq("id", shiftId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ---------- Status transitions ----------

export interface PublishWeekInput {
  weekId: string;
  publisherStaffId: string;
  overrideNote: string | null;
}

export async function publishWeek(
  input: PublishWeekInput
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_SCHEDULE_WEEKS.find((w) => w.id === input.weekId);
    if (!row) return { success: false, error: "Week not found" };
    if (row.status !== "draft") {
      return { success: false, error: `Cannot publish from status ${row.status}` };
    }
    row.status = "published";
    row.published_at = nowIso();
    row.published_by = input.publisherStaffId;
    row.publish_override_note = input.overrideNote;
    row.updated_at = nowIso();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("schedule_publish_week", {
    p_week_id: input.weekId,
    p_publisher_staff_id: input.publisherStaffId,
    p_override_note: input.overrideNote,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function unpublishWeek(
  weekId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_SCHEDULE_WEEKS.find((w) => w.id === weekId);
    if (!row) return { success: false, error: "Week not found" };
    if (row.status !== "published") {
      return {
        success: false,
        error: `Cannot unpublish from status ${row.status}`,
      };
    }
    row.status = "draft";
    row.published_at = null;
    row.published_by = null;
    row.publish_override_note = null;
    row.updated_at = nowIso();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("schedule_unpublish_week", {
    p_week_id: weekId,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function archiveWeek(
  weekId: string
): Promise<{ success: boolean; error?: string }> {
  return setWeekStatus(weekId, "archived");
}

async function setWeekStatus(
  weekId: string,
  status: WeekStatus
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_SCHEDULE_WEEKS.find((w) => w.id === weekId);
    if (!row) return { success: false, error: "Week not found" };
    row.status = status;
    row.updated_at = nowIso();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_weeks")
    .update({ status })
    .eq("id", weekId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Used by the assignment flow to detect double-booking. Returns the user's
 * shifts for the same date, excluding the shift being edited.
 */
export async function listSameDayShiftsForUser(
  userId: string,
  shiftDate: string,
  excludeShiftId?: string
): Promise<ScheduleShift[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_SHIFTS.filter(
      (s) =>
        s.user_id === userId &&
        s.shift_date === shiftDate &&
        (!excludeShiftId || s.id !== excludeShiftId)
    );
  }
  const supabase = createClient();
  let query = supabase
    .from("schedule_shifts")
    .select("*")
    .eq("user_id", userId)
    .eq("shift_date", shiftDate);
  if (excludeShiftId) query = query.neq("id", excludeShiftId);
  const { data } = await query;
  return (data as ScheduleShift[] | null) ?? [];
}
