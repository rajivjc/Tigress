// =============================================================================
// Payroll — settings data layer (Session 27a)
// =============================================================================
// Singleton-style settings row. App-layer guard keeps it singleton (no DB
// constraint) so we always read the most recent row.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_PAYROLL_SETTINGS } from "./mock-data";
import type {
  PayFrequency,
  PayrollExportFormat,
  PayrollSettings,
} from "../types";

const nowIso = () => new Date().toISOString();

export async function getSettings(): Promise<PayrollSettings | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_PAYROLL_SETTINGS[0] ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_payroll_settings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PayrollSettings | null) ?? null;
}

export interface UpdateSettingsInput {
  pay_frequency?: PayFrequency;
  payment_offset_days?: number;
  default_export_format?: PayrollExportFormat;
  statutory_deduction_pct?: number;
  currency?: string;
  timezone?: string;
}

export async function updateSettings(
  input: UpdateSettingsInput
): Promise<PayrollSettings | null> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_PAYROLL_SETTINGS[0];
    if (!row) return null;
    Object.assign(row, input);
    row.updated_at = nowIso();
    return row;
  }
  const current = await getSettings();
  if (!current) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_payroll_settings")
    .update(input)
    .eq("id", current.id)
    .select("*")
    .single();
  return (data as PayrollSettings | null) ?? null;
}
