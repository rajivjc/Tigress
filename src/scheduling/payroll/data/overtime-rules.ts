// =============================================================================
// Payroll — overtime rules data layer (Session 27a)
// =============================================================================
// Singleton: app-layer guard returns the most recent row.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_PAYROLL_OVERTIME_RULES } from "./mock-data";
import type { PayrollOvertimeRules, RestDayStrategy } from "../types";

const nowIso = () => new Date().toISOString();

export async function getOvertimeRules(): Promise<PayrollOvertimeRules | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_PAYROLL_OVERTIME_RULES[0] ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_payroll_overtime_rules")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PayrollOvertimeRules | null) ?? null;
}

export interface UpdateOvertimeRulesInput {
  weekly_threshold_hours?: number | null;
  weekly_ot_multiplier?: number;
  daily_threshold_hours?: number | null;
  daily_ot_multiplier?: number;
  rest_day_multiplier?: number;
  public_holiday_multiplier?: number;
  rest_day_strategy?: RestDayStrategy;
}

export async function updateOvertimeRules(
  input: UpdateOvertimeRulesInput
): Promise<PayrollOvertimeRules | null> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_PAYROLL_OVERTIME_RULES[0];
    if (!row) return null;
    Object.assign(row, input);
    row.updated_at = nowIso();
    return row;
  }
  const current = await getOvertimeRules();
  if (!current) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_payroll_overtime_rules")
    .update(input)
    .eq("id", current.id)
    .select("*")
    .single();
  return (data as PayrollOvertimeRules | null) ?? null;
}
