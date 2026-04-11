import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

interface RegisterPayload {
  email?: unknown;
  password?: unknown;
  full_name?: unknown;
  phone?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Module-level in-memory rate limiter ----
// Keyed on client IP, 5 requests per 15 minutes. Phase 1 runs on a single
// Vercel region so a simple in-memory Map is sufficient; if we ever scale to
// multiple regions this must be swapped for a shared store (Redis, Upstash).
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return bad(
      "Too many registration attempts. Please try again later.",
      429
    );
  }

  let body: RegisterPayload;
  try {
    body = (await request.json()) as RegisterPayload;
  } catch {
    return bad("Invalid JSON body");
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName =
    typeof body.full_name === "string" ? body.full_name.trim() : "";
  const phone =
    typeof body.phone === "string" && body.phone.trim().length > 0
      ? body.phone.trim()
      : null;

  // --- Validation ------------------------------------------------------
  if (!EMAIL_RE.test(email)) {
    return bad("A valid email is required");
  }
  if (password.length < 8) {
    return bad("Password must be at least 8 characters");
  }
  if (fullName.length === 0) {
    return bad("Full name is required");
  }

  // --- Mock mode -------------------------------------------------------
  // When no Supabase project is configured, we don't have anywhere real to
  // create the account. Return a clear 503 so the sign-up page can explain
  // that registration requires a configured Supabase backend.
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      {
        error:
          "Registration requires a configured Supabase backend. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local, then run the migration.",
      },
      { status: 503 }
    );
  }

  const admin = createAdminClient();

  // 1. Create the auth user.
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Phase 1: no email verification flow yet.
      user_metadata: { full_name: fullName },
    });

  if (createError || !created.user) {
    return bad(createError?.message ?? "Failed to create user", 400);
  }

  const authUserId = created.user.id;

  // 2. Insert the matching members row.
  const { error: memberError } = await admin.from("members").insert({
    auth_user_id: authUserId,
    full_name: fullName,
    email,
    phone,
    subscription_status: "none",
    status: "active",
    credits_remaining: 0,
  });

  if (memberError) {
    // Roll back the auth user so we don't leave an orphan.
    await admin.auth.admin.deleteUser(authUserId).catch(() => {
      // Best effort — surface the original error either way.
    });
    return bad(memberError.message, 400);
  }

  return NextResponse.json({ ok: true });
}
