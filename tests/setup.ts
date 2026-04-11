// Global setup file loaded by Vitest before every test file.
//
// Responsibilities:
//   1. Force Supabase into "mock mode" by ensuring the env vars are absent,
//      so every data-layer function exercises its mock branch deterministically.
//   2. Provide utility helpers exported from this file that tests can use
//      to reset MOCK_* arrays between `beforeEach` hooks.

import { beforeEach } from "vitest";
import { __clearMockCookies } from "./stubs/next-headers";

// Unset Supabase env so `isSupabaseConfigured()` returns false.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  __clearMockCookies();
});
