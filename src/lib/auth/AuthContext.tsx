"use client";

import { createContext } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { Member, Staff, UserRole } from "@/lib/types";

export interface AuthState {
  user: SupabaseUser | null;
  profile: Member | Staff | null;
  role: UserRole | null;
  isLoading: boolean;
  /** True when running against the mock fallback rather than real Supabase. */
  isMock: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error?: string; role?: UserRole }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);
