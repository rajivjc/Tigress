// Hardcoded mock users used when Supabase is not configured. Each entry pairs
// a login credential with a fake auth user and the matching member/staff row
// that the real AuthProvider would look up after a successful sign-in.
//
// These exist purely so the scaffold is runnable without a Supabase project.
// Delete this file (and its references) once real auth is the only path.

import type { Member, Staff, UserRole } from "@/lib/types";

export interface MockAuthUser {
  id: string;
  email: string;
}

export interface MockAccount {
  password: string;
  user: MockAuthUser;
  role: UserRole;
  profile: Member | Staff;
}

const now = "2025-01-01T00:00:00.000Z";

export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    password: "password",
    user: { id: "mock-member-1", email: "member@tigress.test" },
    role: "member",
    profile: {
      id: "mock-member-row-1",
      auth_user_id: "mock-member-1",
      full_name: "Mona Member",
      email: "member@tigress.test",
      phone: null,
      avatar_url: null,
      membership_tier_id: null,
      subscription_status: "active",
      stripe_customer_id: null,
      credits_remaining: 4,
      credits_reset_date: null,
      join_date: "2025-01-01",
      status: "active",
      notes: null,
      created_at: now,
      updated_at: now,
    } satisfies Member,
  },
  {
    password: "password",
    user: { id: "mock-staff-1", email: "staff@tigress.test" },
    role: "staff",
    profile: {
      id: "mock-staff-row-1",
      auth_user_id: "mock-staff-1",
      full_name: "Sam Staff",
      email: "staff@tigress.test",
      phone: null,
      role: "staff",
      employment_type: "full_time",
      hourly_rate_cents: null,
      status: "active",
      created_at: now,
      updated_at: now,
    } satisfies Staff,
  },
  {
    password: "password",
    user: { id: "mock-manager-1", email: "manager@tigress.test" },
    role: "manager",
    profile: {
      id: "mock-staff-row-2",
      auth_user_id: "mock-manager-1",
      full_name: "Maya Manager",
      email: "manager@tigress.test",
      phone: null,
      role: "manager",
      employment_type: "full_time",
      hourly_rate_cents: null,
      status: "active",
      created_at: now,
      updated_at: now,
    } satisfies Staff,
  },
  {
    password: "password",
    user: { id: "mock-owner-1", email: "owner@tigress.test" },
    role: "owner",
    profile: {
      id: "mock-staff-row-3",
      auth_user_id: "mock-owner-1",
      full_name: "Olive Owner",
      email: "owner@tigress.test",
      phone: null,
      role: "owner",
      employment_type: "full_time",
      hourly_rate_cents: null,
      status: "active",
      created_at: now,
      updated_at: now,
    } satisfies Staff,
  },
  // Two part-time staff so the scheduling foundation has somebody to roster
  // through the PT-availability path. Login flows use the same shared
  // password as the rest of the mock accounts.
  {
    password: "password",
    user: { id: "mock-pt-1", email: "pat@tigress.test" },
    role: "staff",
    profile: {
      id: "mock-staff-row-4",
      auth_user_id: "mock-pt-1",
      full_name: "Pat Part-Time",
      email: "pat@tigress.test",
      phone: null,
      role: "staff",
      employment_type: "part_time",
      hourly_rate_cents: null,
      status: "active",
      created_at: now,
      updated_at: now,
    } satisfies Staff,
  },
  {
    password: "password",
    user: { id: "mock-pt-2", email: "phoebe@tigress.test" },
    role: "staff",
    profile: {
      id: "mock-staff-row-5",
      auth_user_id: "mock-pt-2",
      full_name: "Phoebe Floor",
      email: "phoebe@tigress.test",
      phone: null,
      role: "staff",
      employment_type: "part_time",
      hourly_rate_cents: null,
      status: "active",
      created_at: now,
      updated_at: now,
    } satisfies Staff,
  },
];

export function findMockAccount(
  email: string,
  password: string
): MockAccount | null {
  const match = MOCK_ACCOUNTS.find(
    (a) => a.user.email.toLowerCase() === email.toLowerCase()
  );
  if (!match) return null;
  if (match.password !== password) return null;
  return match;
}

// Cookie used so middleware can detect mock sessions server-side (mock mode
// only — in real Supabase mode the middleware reads the sb-* cookies).
export const MOCK_SESSION_COOKIE = "tigress-mock-session";
