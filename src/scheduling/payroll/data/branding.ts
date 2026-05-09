// =============================================================================
// Payroll — venue branding data layer (Session 27b)
// =============================================================================
// Singleton venue-branding row consumed by payslip rendering (PDF/JSON and
// the staff-side payslip view). Schema-level singleton enforcement uses the
// same generated-boolean + UNIQUE pattern from S27a-fix-2 Finding 7;
// application-layer reads always pull the most-recent row to be defensive
// against any pre-S27b mock fixtures that might not have the constraint.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_PAYROLL_VENUE_BRANDING } from "./mock-data";
import type { PayrollVenueBranding } from "../types";

const nowIso = () => new Date().toISOString();

export async function getBranding(): Promise<PayrollVenueBranding | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_PAYROLL_VENUE_BRANDING[0] ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("payroll_venue_branding")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PayrollVenueBranding | null) ?? null;
}

export interface UpdateBrandingInput {
  venue_name?: string;
  address?: string;
  contact_email?: string;
  contact_phone?: string;
  logo_url?: string;
}

export async function updateBranding(
  input: UpdateBrandingInput
): Promise<PayrollVenueBranding | null> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_PAYROLL_VENUE_BRANDING[0];
    if (!row) return null;
    Object.assign(row, input);
    row.updated_at = nowIso();
    return row;
  }
  const current = await getBranding();
  if (!current) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("payroll_venue_branding")
    .update(input)
    .eq("id", current.id)
    .select("*")
    .single();
  return (data as PayrollVenueBranding | null) ?? null;
}
