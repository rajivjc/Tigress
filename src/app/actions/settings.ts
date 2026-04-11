"use server";

// =============================================================================
// Owner settings server actions
// =============================================================================
// Thin wrappers around the tier + rate-card CRUD helpers in
// src/lib/data/settings.ts. Every action gates on `role === 'owner'` before
// delegating to the data layer, and revalidates the relevant owner pages.
// =============================================================================

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data/staff";
import {
  createRateCardEntry,
  createTier,
  deleteRateCardEntry,
  toggleRateCardEntry,
  updateRateCardEntry,
  updateTier,
  type RateInput,
  type RatePatch,
  type TierInput,
  type TierPatch,
} from "@/lib/data/settings";

async function requireOwner(): Promise<{ ok: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { ok: false, error: "Not signed in" };
  if (current.role !== "owner") return { ok: false, error: "Owner only" };
  return { ok: true };
}

// ---------- Tiers ----------

export async function updateTierAction(
  tierId: string,
  patch: TierPatch
): Promise<{ success: boolean; error?: string }> {
  const gate = await requireOwner();
  if (!gate.ok) return { success: false, error: gate.error };

  const result = await updateTier(tierId, patch);
  if (result.success) revalidatePath("/settings");
  return result;
}

export async function createTierAction(
  input: TierInput
): Promise<{ success: boolean; tierId?: string; error?: string }> {
  const gate = await requireOwner();
  if (!gate.ok) return { success: false, error: gate.error };

  const result = await createTier(input);
  if (result.success) revalidatePath("/settings");
  return result;
}

// ---------- Rate card ----------

export async function updateRateCardAction(
  rateId: string,
  patch: RatePatch
): Promise<{ success: boolean; error?: string }> {
  const gate = await requireOwner();
  if (!gate.ok) return { success: false, error: gate.error };

  const result = await updateRateCardEntry(rateId, patch);
  if (result.success) revalidatePath("/rates");
  return result;
}

export async function createRateCardAction(
  input: RateInput
): Promise<{ success: boolean; rateId?: string; error?: string }> {
  const gate = await requireOwner();
  if (!gate.ok) return { success: false, error: gate.error };

  const result = await createRateCardEntry(input);
  if (result.success) revalidatePath("/rates");
  return result;
}

export async function deleteRateCardAction(
  rateId: string
): Promise<{ success: boolean; error?: string }> {
  const gate = await requireOwner();
  if (!gate.ok) return { success: false, error: gate.error };

  const result = await deleteRateCardEntry(rateId);
  if (result.success) revalidatePath("/rates");
  return result;
}

export async function toggleRateCardAction(
  rateId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const gate = await requireOwner();
  if (!gate.ok) return { success: false, error: gate.error };

  const result = await toggleRateCardEntry(rateId, isActive);
  if (result.success) revalidatePath("/rates");
  return result;
}
