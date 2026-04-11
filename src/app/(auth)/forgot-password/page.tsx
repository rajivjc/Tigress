"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!isSupabaseConfigured()) {
      // Mock mode: pretend it worked so the flow is testable end to end.
      setSubmitted(true);
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/login`
          : undefined;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo }
      );
      if (resetError) {
        // Still show the generic success message — don't leak whether the
        // email exists. Log the error for debugging in dev.
        console.error("resetPasswordForEmail failed", resetError);
      }
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-surface/60 p-6 shadow-xl backdrop-blur">
      <h2 className="mb-1 text-xl font-semibold text-white">Reset password</h2>
      <p className="mb-6 text-sm text-white/50">
        We&apos;ll send a reset link to your email
      </p>

      {submitted ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-white/70">
          If an account exists for <span className="text-white">{email}</span>,
          a reset link has been sent.
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-xs uppercase tracking-wider text-white/50"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-accent"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}

      <div className="mt-4 text-center text-xs">
        <Link href="/login" className="text-white/50 hover:text-accent">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
