import { describe, it, expect, afterEach } from "vitest";
import {
  isSupabaseConfigured,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/env";

describe("Supabase env detection", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("returns false when url and key are missing", () => {
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("returns false when either var is a placeholder", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "your-supabase-url";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "your-supabase-anon-key";
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("returns false with an empty string value", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("returns true once both real values are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "real-anon-key";
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("admin is false unless configured AND service role key is present", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "real-anon-key";
    expect(isSupabaseAdminConfigured()).toBe(false);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "real-service-role";
    expect(isSupabaseAdminConfigured()).toBe(true);
  });

  it("admin is false when the service role key is a placeholder", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "real-anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "your-supabase-service-role-key";
    expect(isSupabaseAdminConfigured()).toBe(false);
  });
});
