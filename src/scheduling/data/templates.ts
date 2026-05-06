// =============================================================================
// Scheduling — shift template + day-coverage data accessors (Session 25)
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_SCHEDULE_DAY_COVERAGE,
  MOCK_SCHEDULE_TEMPLATES,
} from "./mock-data";
import type {
  RoleRequirements,
  ShiftTemplate,
  TemplateDayCoverage,
} from "../types";

const nowIso = () => new Date().toISOString();
const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ---------- Templates ----------

export async function listShiftTemplates(): Promise<ShiftTemplate[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_TEMPLATES.slice().sort(
      (a, b) => a.sort_order - b.sort_order
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_shift_templates")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data as ShiftTemplate[] | null) ?? [];
}

export async function getShiftTemplate(
  templateId: string
): Promise<ShiftTemplate | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_TEMPLATES.find((t) => t.id === templateId) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_shift_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  return (data as ShiftTemplate | null) ?? null;
}

export interface UpsertTemplateInput {
  id?: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order?: number;
  is_active?: boolean;
}

export async function upsertShiftTemplate(
  input: UpsertTemplateInput
): Promise<{ success: boolean; templateId?: string; error?: string }> {
  if (!input.name.trim()) {
    return { success: false, error: "Name is required" };
  }
  if (!input.start_time || !input.end_time) {
    return { success: false, error: "Start and end time are required" };
  }

  if (!isSupabaseConfigured()) {
    if (input.id) {
      const row = MOCK_SCHEDULE_TEMPLATES.find((t) => t.id === input.id);
      if (!row) return { success: false, error: "Template not found" };
      row.name = input.name.trim();
      row.start_time = input.start_time;
      row.end_time = input.end_time;
      if (input.sort_order !== undefined) row.sort_order = input.sort_order;
      if (input.is_active !== undefined) row.is_active = input.is_active;
      row.updated_at = nowIso();
      return { success: true, templateId: row.id };
    }
    const newRow: ShiftTemplate = {
      id: id("schedule-template"),
      name: input.name.trim(),
      start_time: input.start_time,
      end_time: input.end_time,
      sort_order:
        input.sort_order ??
        MOCK_SCHEDULE_TEMPLATES.reduce(
          (m, t) => Math.max(m, t.sort_order),
          0
        ) + 1,
      is_active: input.is_active ?? true,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    MOCK_SCHEDULE_TEMPLATES.push(newRow);
    return { success: true, templateId: newRow.id };
  }

  const supabase = createClient();
  if (input.id) {
    const update: Record<string, unknown> = {
      name: input.name.trim(),
      start_time: input.start_time,
      end_time: input.end_time,
    };
    if (input.sort_order !== undefined) update.sort_order = input.sort_order;
    if (input.is_active !== undefined) update.is_active = input.is_active;
    const { error } = await supabase
      .from("schedule_shift_templates")
      .update(update)
      .eq("id", input.id);
    if (error) return { success: false, error: error.message };
    return { success: true, templateId: input.id };
  }
  const { data, error } = await supabase
    .from("schedule_shift_templates")
    .insert({
      name: input.name.trim(),
      start_time: input.start_time,
      end_time: input.end_time,
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, templateId: (data as { id: string }).id };
}

export async function deleteShiftTemplate(
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  // Soft-delete via is_active = false so historical shifts still resolve
  // their template name.
  if (!isSupabaseConfigured()) {
    const row = MOCK_SCHEDULE_TEMPLATES.find((t) => t.id === templateId);
    if (!row) return { success: false, error: "Template not found" };
    row.is_active = false;
    row.updated_at = nowIso();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_shift_templates")
    .update({ is_active: false })
    .eq("id", templateId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ---------- Day coverage ----------

export async function listDayCoverage(): Promise<TemplateDayCoverage[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_SCHEDULE_DAY_COVERAGE.slice();
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_template_day_coverage")
    .select("*");
  return (data as TemplateDayCoverage[] | null) ?? [];
}

export async function setTemplateDayCoverage(
  templateId: string,
  dayOfWeek: number,
  roleRequirements: RoleRequirements
): Promise<{ success: boolean; error?: string }> {
  if (dayOfWeek < 0 || dayOfWeek > 6) {
    return { success: false, error: "day_of_week must be 0..6" };
  }
  // Strip zero-or-negative entries — they're not requirements.
  const cleaned: RoleRequirements = {};
  for (const [k, v] of Object.entries(roleRequirements)) {
    if (typeof v === "number" && v > 0) {
      cleaned[k as keyof RoleRequirements] = Math.floor(v);
    }
  }

  if (!isSupabaseConfigured()) {
    const existing = MOCK_SCHEDULE_DAY_COVERAGE.find(
      (r) => r.template_id === templateId && r.day_of_week === dayOfWeek
    );
    if (existing) {
      existing.role_requirements = cleaned;
      existing.updated_at = nowIso();
    } else {
      MOCK_SCHEDULE_DAY_COVERAGE.push({
        id: id("schedule-coverage"),
        template_id: templateId,
        day_of_week: dayOfWeek,
        role_requirements: cleaned,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
    }
    return { success: true };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_template_day_coverage")
    .upsert(
      {
        template_id: templateId,
        day_of_week: dayOfWeek,
        role_requirements: cleaned,
      },
      { onConflict: "template_id,day_of_week" }
    );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function removeTemplateDayCoverage(
  templateId: string,
  dayOfWeek: number
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_SCHEDULE_DAY_COVERAGE.findIndex(
      (r) => r.template_id === templateId && r.day_of_week === dayOfWeek
    );
    if (idx === -1) return { success: true };
    MOCK_SCHEDULE_DAY_COVERAGE.splice(idx, 1);
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_template_day_coverage")
    .delete()
    .eq("template_id", templateId)
    .eq("day_of_week", dayOfWeek);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
