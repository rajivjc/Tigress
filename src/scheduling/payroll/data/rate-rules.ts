// =============================================================================
// Payroll — rate rules data layer (Session 27a)
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_PAYROLL_RATE_RULES } from "./mock-data";
import type { PayrollRateRule, RateRuleKind } from "../types";

const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

export async function listRateRules(): Promise<PayrollRateRule[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_PAYROLL_RATE_RULES.slice();
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_payroll_rate_rules")
    .select("*")
    .order("priority", { ascending: true });
  return (data as PayrollRateRule[] | null) ?? [];
}

export interface UpsertRateRuleInput {
  id?: string;
  kind: RateRuleKind;
  match_value: string;
  window_start?: string | null;
  window_end?: string | null;
  multiplier: number;
  priority: number;
  is_active: boolean;
}

export async function upsertRateRule(
  input: UpsertRateRuleInput
): Promise<{ success: boolean; rule?: PayrollRateRule; error?: string }> {
  if (input.multiplier <= 0) {
    return { success: false, error: "Multiplier must be > 0" };
  }
  if (!isSupabaseConfigured()) {
    if (input.id) {
      const existing = MOCK_PAYROLL_RATE_RULES.find((r) => r.id === input.id);
      if (!existing) return { success: false, error: "Rule not found" };
      Object.assign(existing, {
        kind: input.kind,
        match_value: input.match_value,
        window_start: input.window_start ?? null,
        window_end: input.window_end ?? null,
        multiplier: input.multiplier,
        priority: input.priority,
        is_active: input.is_active,
        updated_at: nowIso(),
      });
      return { success: true, rule: existing };
    }
    const row: PayrollRateRule = {
      id: id("payroll-rule"),
      kind: input.kind,
      match_value: input.match_value,
      window_start: input.window_start ?? null,
      window_end: input.window_end ?? null,
      multiplier: input.multiplier,
      priority: input.priority,
      is_active: input.is_active,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    MOCK_PAYROLL_RATE_RULES.push(row);
    return { success: true, rule: row };
  }
  const supabase = createClient();
  if (input.id) {
    const { data, error } = await supabase
      .from("schedule_payroll_rate_rules")
      .update({
        kind: input.kind,
        match_value: input.match_value,
        window_start: input.window_start ?? null,
        window_end: input.window_end ?? null,
        multiplier: input.multiplier,
        priority: input.priority,
        is_active: input.is_active,
      })
      .eq("id", input.id)
      .select("*")
      .single();
    if (error || !data) return { success: false, error: error?.message };
    return { success: true, rule: data as PayrollRateRule };
  }
  const { data, error } = await supabase
    .from("schedule_payroll_rate_rules")
    .insert({
      kind: input.kind,
      match_value: input.match_value,
      window_start: input.window_start ?? null,
      window_end: input.window_end ?? null,
      multiplier: input.multiplier,
      priority: input.priority,
      is_active: input.is_active,
    })
    .select("*")
    .single();
  if (error || !data) return { success: false, error: error?.message };
  return { success: true, rule: data as PayrollRateRule };
}

export async function removeRateRule(
  ruleId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_PAYROLL_RATE_RULES.findIndex((r) => r.id === ruleId);
    if (idx >= 0) MOCK_PAYROLL_RATE_RULES.splice(idx, 1);
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_payroll_rate_rules")
    .delete()
    .eq("id", ruleId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
