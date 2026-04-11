"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Member, Staff, UserRole } from "@/lib/types";
import {
  MOCK_ACCOUNTS,
  MOCK_SESSION_COOKIE,
  type MockAccount,
  findMockAccount,
} from "./mock-users";
import { AuthContext, type AuthState } from "./AuthContext";

const MOCK_STORAGE_KEY = "tigress-mock-session";

/**
 * Wraps the app with an auth context. Runs in one of two modes:
 *
 *   - "real" — Supabase env vars are set. Calls supabase.auth.signIn, looks
 *              up the user in the staff table first then the members table.
 *   - "mock" — env vars are missing or still placeholders. Authenticates
 *              against a hardcoded list of test accounts in mock-users.ts.
 *
 * The mode is picked once at mount based on process.env values.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isMock = !isSupabaseConfigured();

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<Member | Staff | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Lazily create the browser client only in real mode.
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!isMock && !supabaseRef.current) {
    supabaseRef.current = createClient();
  }

  // -------------------------------------------------------------------------
  // Mock mode
  // -------------------------------------------------------------------------
  const applyMockAccount = useCallback((account: MockAccount) => {
    const fakeUser = {
      id: account.user.id,
      email: account.user.email,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as unknown as SupabaseUser;
    setUser(fakeUser);
    setProfile(account.profile);
    setRole(account.role);
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    setProfile(null);
    setRole(null);
  }, []);

  const writeMockCookie = (accountId: string | null) => {
    if (typeof document === "undefined") return;
    if (accountId) {
      document.cookie = `${MOCK_SESSION_COOKIE}=${encodeURIComponent(
        accountId
      )}; path=/; max-age=604800; samesite=lax`;
    } else {
      document.cookie = `${MOCK_SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
    }
  };

  // -------------------------------------------------------------------------
  // Profile lookup for real Supabase sessions
  // -------------------------------------------------------------------------
  const loadProfileForUser = useCallback(
    async (authUser: SupabaseUser): Promise<UserRole | null> => {
      const supabase = supabaseRef.current;
      if (!supabase) return null;

      // Staff table first — if present, the staff row's role is the source of
      // truth ("staff" | "manager" | "owner").
      const { data: staffRow } = await supabase
        .from("staff")
        .select("*")
        .eq("auth_user_id", authUser.id)
        .maybeSingle();

      if (staffRow) {
        const staffRole = (staffRow as Staff).role;
        setUser(authUser);
        setProfile(staffRow as Staff);
        setRole(staffRole);
        return staffRole;
      }

      // Fall back to members table.
      const { data: memberRow } = await supabase
        .from("members")
        .select("*")
        .eq("auth_user_id", authUser.id)
        .maybeSingle();

      if (memberRow) {
        setUser(authUser);
        setProfile(memberRow as Member);
        setRole("member");
        return "member";
      }

      // Orphan auth user — sign out to avoid a half-authenticated state.
      await supabase.auth.signOut();
      clearAuth();
      return null;
    },
    [clearAuth]
  );

  // -------------------------------------------------------------------------
  // Initial load + subscription
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (isMock) {
        try {
          const stored =
            typeof window !== "undefined"
              ? window.localStorage.getItem(MOCK_STORAGE_KEY)
              : null;
          if (stored) {
            const account = MOCK_ACCOUNTS.find((a) => a.user.id === stored);
            if (account) {
              applyMockAccount(account);
            }
          }
        } catch {
          // ignore — localStorage may be unavailable (private mode, SSR)
        }
        if (!cancelled) setIsLoading(false);
        return;
      }

      const supabase = supabaseRef.current!;
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (authUser) {
        await loadProfileForUser(authUser);
      }
      setIsLoading(false);
    }

    init();

    if (isMock) {
      return () => {
        cancelled = true;
      };
    }

    const supabase = supabaseRef.current!;
    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_OUT" || !session?.user) {
          clearAuth();
          return;
        }
        await loadProfileForUser(session.user);
      }
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [isMock, applyMockAccount, clearAuth, loadProfileForUser]);

  // -------------------------------------------------------------------------
  // signIn / signOut
  // -------------------------------------------------------------------------
  const signIn = useCallback(
    async (email: string, password: string) => {
      if (isMock) {
        const account = findMockAccount(email, password);
        if (!account) {
          return { error: "Invalid email or password" };
        }
        applyMockAccount(account);
        try {
          window.localStorage.setItem(MOCK_STORAGE_KEY, account.user.id);
        } catch {
          // ignore
        }
        writeMockCookie(account.user.id);
        return { role: account.role };
      }

      const supabase = supabaseRef.current!;
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        return { error: error.message };
      }
      if (!data.user) {
        return { error: "Sign-in failed: no user returned" };
      }
      const resolvedRole = await loadProfileForUser(data.user);
      if (!resolvedRole) {
        return {
          error: "No member or staff profile found for this account.",
        };
      }
      return { role: resolvedRole };
    },
    [isMock, applyMockAccount, loadProfileForUser]
  );

  const signOut = useCallback(async () => {
    if (isMock) {
      try {
        window.localStorage.removeItem(MOCK_STORAGE_KEY);
      } catch {
        // ignore
      }
      writeMockCookie(null);
      clearAuth();
      return;
    }
    const supabase = supabaseRef.current!;
    await supabase.auth.signOut();
    clearAuth();
  }, [isMock, clearAuth]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      role,
      isLoading,
      isMock,
      signIn,
      signOut,
    }),
    [user, profile, role, isLoading, isMock, signIn, signOut]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
