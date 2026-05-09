// =============================================================================
// Payroll — per-staff rate history (Session 27a)
// =============================================================================
// Resolving "what was X's rate on date D" is a function of
// effective_from <= D AND (effective_until IS NULL OR effective_until > D).
//
// Setting a new rate closes the previous open row (sets effective_until)
// and opens a new row.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_PAYROLL_RATES } from "./mock-data";
import type { PayrollRate } from "../types";

const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

export async function listRatesForStaff(
  staffId: string
): Promise<PayrollRate[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_PAYROLL_RATES.filter((r) => r.staff_id === staffId)
      .slice()
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_payroll_rates")
    .select("*")
    .eq("staff_id", staffId)
    .order("effective_from", { ascending: false });
  return (data as PayrollRate[] | null) ?? [];
}

export async function listAllRates(): Promise<PayrollRate[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_PAYROLL_RATES.slice();
  }
  const supabase = createClient();
  const { data } = await supabase.from("schedule_payroll_rates").select("*");
  return (data as PayrollRate[] | null) ?? [];
}

/**
 * Returns the rate active on `onDate` for a given staff, or null.
 * Active = effective_from <= onDate AND (effective_until IS NULL OR effective_until > onDate).
 */
export async function getRateOn(
  staffId: string,
  onDate: string
): Promise<PayrollRate | null> {
  const rates = await listRatesForStaff(staffId);
  return (
    rates.find(
      (r) =>
        r.effective_from <= onDate &&
        (r.effective_until === null || r.effective_until > onDate)
    ) ?? null
  );
}

export interface SetRateInput {
  staffId: string;
  hourlyRate: number;
  effectiveFrom: string;
}

export async function setStaffRate(
  input: SetRateInput
): Promise<{ success: boolean; rate?: PayrollRate; error?: string }> {
  if (input.hourlyRate < 0) {
    return { success: false, error: "Hourly rate cannot be negative" };
  }

  if (!isSupabaseConfigured()) {
    // Close any open prior row at effective_from.
    for (const r of MOCK_PAYROLL_RATES) {
      if (
        r.staff_id === input.staffId &&
        r.effective_until === null &&
        r.effective_from < input.effectiveFrom
      ) {
        r.effective_until = input.effectiveFrom;
        r.updated_at = nowIso();
      }
    }
    const row: PayrollRate = {
      id: id("payroll-rate"),
      staff_id: input.staffId,
      hourly_rate: input.hourlyRate,
      effective_from: input.effectiveFrom,
      effective_until: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    MOCK_PAYROLL_RATES.push(row);
    return { success: true, rate: row };
  }

  const supabase = createClient();
  await supabase
    .from("schedule_payroll_rates")
    .update({ effective_until: input.effectiveFrom })
    .eq("staff_id", input.staffId)
    .is("effective_until", null)
    .lt("effective_from", input.effectiveFrom);
  const { data, error } = await supabase
    .from("schedule_payroll_rates")
    .insert({
      staff_id: input.staffId,
      hourly_rate: input.hourlyRate,
      effective_from: input.effectiveFrom,
      effective_until: null,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, rate: data as PayrollRate };
}

export async function endStaffRate(
  staffId: string,
  effectiveUntil: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    for (const r of MOCK_PAYROLL_RATES) {
      if (r.staff_id === staffId && r.effective_until === null) {
        r.effective_until = effectiveUntil;
        r.updated_at = nowIso();
      }
    }
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_payroll_rates")
    .update({ effective_until: effectiveUntil })
    .eq("staff_id", staffId)
    .is("effective_until", null);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
