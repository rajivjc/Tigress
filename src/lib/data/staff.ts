// =============================================================================
// Staff data accessors
// =============================================================================
// Server-only helpers for resolving the current staff user (for role-based
// auth checks in server actions) and fetching staff records. Falls back to
// mock data when Supabase is not configured.
// =============================================================================

import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_ACCOUNTS, MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import type { Staff, StaffRole } from "@/lib/types";

export interface CurrentStaff {
  staff: Staff;
  role: StaffRole;
}

/**
 * Returns the currently authenticated staff (or null if the user is not
 * signed in or is a member). Use inside server actions to gate staff-only
 * mutations like walk-ins and slot blocking.
 */
export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  if (!isSupabaseConfigured()) {
    const authId = cookies().get(MOCK_SESSION_COOKIE)?.value;
    if (!authId) return null;
    const account = MOCK_ACCOUNTS.find((a) => a.user.id === authId);
    if (!account) return null;
    if (account.role === "member") return null;
    return { staff: account.profile as Staff, role: account.role as StaffRole };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("staff")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data) return null;
  const staff = data as Staff;
  return { staff, role: staff.role };
}

/** Convenience: returns true if the current user can manage (manager/owner). */
export async function isCurrentUserManagerOrOwner(): Promise<boolean> {
  const current = await getCurrentStaff();
  if (!current) return false;
  return current.role === "manager" || current.role === "owner";
}
