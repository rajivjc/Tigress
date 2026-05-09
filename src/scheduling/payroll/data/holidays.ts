// =============================================================================
// Payroll — holidays data layer (Session 27a)
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_PAYROLL_HOLIDAYS } from "./mock-data";
import type { PayrollHoliday } from "../types";

const nowIso = () => new Date().toISOString();

export async function listHolidays(activeOnly = false): Promise<PayrollHoliday[]> {
  if (!isSupabaseConfigured()) {
    const all = MOCK_PAYROLL_HOLIDAYS.slice().sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    return activeOnly ? all.filter((h) => h.is_active) : all;
  }
  const supabase = createClient();
  const q = supabase
    .from("schedule_payroll_holidays")
    .select("*")
    .order("date", { ascending: true });
  if (activeOnly) q.eq("is_active", true);
  const { data } = await q;
  return (data as PayrollHoliday[] | null) ?? [];
}

export async function listHolidaysInRange(
  startDate: string,
  endDate: string
): Promise<PayrollHoliday[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_PAYROLL_HOLIDAYS.filter(
      (h) => h.is_active && h.date >= startDate && h.date <= endDate
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_payroll_holidays")
    .select("*")
    .eq("is_active", true)
    .gte("date", startDate)
    .lte("date", endDate);
  return (data as PayrollHoliday[] | null) ?? [];
}

export interface UpsertHolidayInput {
  date: string;
  name: string;
  is_active: boolean;
}

export async function upsertHoliday(
  input: UpsertHolidayInput
): Promise<{ success: boolean; holiday?: PayrollHoliday; error?: string }> {
  if (!isSupabaseConfigured()) {
    const existing = MOCK_PAYROLL_HOLIDAYS.find((h) => h.date === input.date);
    if (existing) {
      existing.name = input.name;
      existing.is_active = input.is_active;
      return { success: true, holiday: existing };
    }
    const row: PayrollHoliday = {
      date: input.date,
      name: input.name,
      is_active: input.is_active,
      created_at: nowIso(),
    };
    MOCK_PAYROLL_HOLIDAYS.push(row);
    return { success: true, holiday: row };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_payroll_holidays")
    .upsert(input, { onConflict: "date" })
    .select("*")
    .single();
  if (error || !data) return { success: false, error: error?.message };
  return { success: true, holiday: data as PayrollHoliday };
}

export async function removeHoliday(
  date: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_PAYROLL_HOLIDAYS.findIndex((h) => h.date === date);
    if (idx >= 0) MOCK_PAYROLL_HOLIDAYS.splice(idx, 1);
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_payroll_holidays")
    .delete()
    .eq("date", date);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
