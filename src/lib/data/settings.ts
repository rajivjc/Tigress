// =============================================================================
// Owner settings data accessors
// =============================================================================
// CRUD helpers for membership_tiers + rate_card tables. All writes here assume
// the caller is an owner — the action layer is responsible for enforcing that
// role check before invoking these functions.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_TIERS } from "./mock-data";
import type { MembershipTier, RateCardEntry, RateType } from "@/lib/types";

// ---------- Tiers ----------

export type TierPatch = Partial<
  Pick<
    MembershipTier,
    | "name"
    | "monthly_price_cents"
    | "credits_per_month"
    | "priority_booking_days"
    | "guest_passes_per_month"
  >
>;

export type TierInput = Omit<TierPatch, "name"> & { name: string };

export async function updateTier(
  tierId: string,
  patch: TierPatch
): Promise<{ success: boolean; error?: string }> {
  if (Object.keys(patch).length === 0) {
    return { success: true };
  }

  if (!isSupabaseConfigured()) {
    const row = MOCK_TIERS.find((t) => t.id === tierId);
    if (!row) return { success: false, error: "Tier not found" };
    Object.assign(row, patch);
    row.updated_at = new Date().toISOString();
    return { success: true };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("membership_tiers")
    .update(patch)
    .eq("id", tierId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function createTier(
  input: TierInput
): Promise<{ success: boolean; tierId?: string; error?: string }> {
  if (!input.name || input.name.trim().length === 0) {
    return { success: false, error: "Name is required" };
  }

  if (!isSupabaseConfigured()) {
    const id = `mock-tier-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const row: MembershipTier = {
      id,
      name: input.name.trim(),
      monthly_price_cents: input.monthly_price_cents ?? 0,
      credits_per_month: input.credits_per_month ?? 0,
      priority_booking_days: input.priority_booking_days ?? 3,
      guest_passes_per_month: input.guest_passes_per_month ?? 0,
      perks: [],
      sort_order: MOCK_TIERS.length + 1,
      created_at: nowIso,
      updated_at: nowIso,
    };
    MOCK_TIERS.push(row);
    return { success: true, tierId: id };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("membership_tiers")
    .insert({
      name: input.name.trim(),
      monthly_price_cents: input.monthly_price_cents ?? 0,
      credits_per_month: input.credits_per_month ?? 0,
      priority_booking_days: input.priority_booking_days ?? 3,
      guest_passes_per_month: input.guest_passes_per_month ?? 0,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, tierId: (data as { id: string }).id };
}

// ---------- Rate card ----------

// In-memory mock rate card state so the owner rates page has data to mutate.
const MOCK_RATE_CARD: RateCardEntry[] = [
  {
    id: "rate-hourly",
    rate_type: "hourly",
    label: "Standard Table Rate",
    amount_cents: 2000,
    description: "Per table per hour",
    is_active: true,
    sort_order: 1,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "rate-per-person",
    rate_type: "per_person",
    label: "Per Person Rate",
    amount_cents: 800,
    description: "Per person per hour",
    is_active: true,
    sort_order: 2,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "rate-per-game",
    rate_type: "per_game",
    label: "Per Game Rate",
    amount_cents: 500,
    description: "Per game",
    is_active: true,
    sort_order: 3,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
  },
];

export async function getAllRateCardEntries(): Promise<RateCardEntry[]> {
  if (!isSupabaseConfigured()) {
    return [...MOCK_RATE_CARD].sort((a, b) => a.sort_order - b.sort_order);
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("rate_card")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data as RateCardEntry[] | null) ?? [];
}

export type RatePatch = Partial<
  Pick<RateCardEntry, "label" | "amount_cents" | "description">
>;

export interface RateInput {
  rate_type: RateType;
  label: string;
  amount_cents: number;
  description?: string | null;
}

export async function updateRateCardEntry(
  rateId: string,
  patch: RatePatch
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_RATE_CARD.find((r) => r.id === rateId);
    if (!row) return { success: false, error: "Rate not found" };
    Object.assign(row, patch);
    row.updated_at = new Date().toISOString();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("rate_card")
    .update(patch)
    .eq("id", rateId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function createRateCardEntry(
  input: RateInput
): Promise<{ success: boolean; rateId?: string; error?: string }> {
  if (!input.label || input.label.trim().length === 0) {
    return { success: false, error: "Label is required" };
  }
  if (!Number.isFinite(input.amount_cents) || input.amount_cents < 0) {
    return { success: false, error: "Amount must be non-negative" };
  }

  if (!isSupabaseConfigured()) {
    const id = `mock-rate-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const nextOrder =
      MOCK_RATE_CARD.reduce((acc, r) => Math.max(acc, r.sort_order), 0) + 1;
    const row: RateCardEntry = {
      id,
      rate_type: input.rate_type,
      label: input.label.trim(),
      amount_cents: Math.round(input.amount_cents),
      description: input.description ?? null,
      is_active: true,
      sort_order: nextOrder,
      created_at: nowIso,
      updated_at: nowIso,
    };
    MOCK_RATE_CARD.push(row);
    return { success: true, rateId: id };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("rate_card")
    .insert({
      rate_type: input.rate_type,
      label: input.label.trim(),
      amount_cents: Math.round(input.amount_cents),
      description: input.description ?? null,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, rateId: (data as { id: string }).id };
}

export async function deleteRateCardEntry(
  rateId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = MOCK_RATE_CARD.findIndex((r) => r.id === rateId);
    if (idx === -1) return { success: false, error: "Rate not found" };
    MOCK_RATE_CARD.splice(idx, 1);
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("rate_card")
    .delete()
    .eq("id", rateId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function toggleRateCardEntry(
  rateId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_RATE_CARD.find((r) => r.id === rateId);
    if (!row) return { success: false, error: "Rate not found" };
    row.is_active = isActive;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("rate_card")
    .update({ is_active: isActive })
    .eq("id", rateId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
