// Runtime check for whether Supabase is configured with real credentials.
// When env vars are missing OR still set to the placeholder values from
// .env.local.example, we fall back to a mock auth implementation so the
// scaffold stays runnable without a Supabase project.

const PLACEHOLDER_VALUES = new Set([
  "",
  "your-supabase-url",
  "your-supabase-anon-key",
  "your-supabase-service-role-key",
]);

function isReal(value: string | undefined): boolean {
  if (!value) return false;
  return !PLACEHOLDER_VALUES.has(value);
}

export function isSupabaseConfigured(): boolean {
  return (
    isReal(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    isReal(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function isSupabaseAdminConfigured(): boolean {
  return (
    isSupabaseConfigured() && isReal(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}
