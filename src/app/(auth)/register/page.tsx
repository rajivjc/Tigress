"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function RegisterPage() {
  const router = useRouter();
  const { signIn, isMock } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          phone: phone || undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? "Registration failed");
        setLoading(false);
        return;
      }

      // Auto sign-in on success.
      const signInResult = await signIn(email, password);
      if (signInResult.error || !signInResult.role) {
        setError(
          signInResult.error ??
            "Account created but sign-in failed — please try logging in."
        );
        setLoading(false);
        return;
      }

      router.replace("/dashboard");
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-surface/60 p-6 shadow-xl backdrop-blur">
      <h2 className="mb-1 text-xl font-semibold text-white">Create account</h2>
      <p className="mb-6 text-sm text-white/50">
        Join Tigress as a member
      </p>

      {isMock && (
        <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
          Supabase isn&apos;t configured yet, so registration is disabled.
          Sign in with one of the mock accounts from the login page.
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="full_name"
            className="mb-1 block text-xs uppercase tracking-wider text-white/50"
          >
            Full name
          </label>
          <input
            id="full_name"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-accent"
          />
        </div>
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
        <div>
          <label
            htmlFor="phone"
            className="mb-1 block text-xs uppercase tracking-wider text-white/50"
          >
            Phone <span className="text-white/30">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+65 9123 4567"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-accent"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-xs uppercase tracking-wider text-white/50"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-accent"
          />
        </div>
        <div>
          <label
            htmlFor="confirm_password"
            className="mb-1 block text-xs uppercase tracking-wider text-white/50"
          >
            Confirm password
          </label>
          <input
            id="confirm_password"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
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
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <div className="mt-4 text-center text-xs">
        <Link href="/login" className="text-white/50 hover:text-accent">
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}
