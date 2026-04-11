"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/lib/types";

function homeRouteFor(role: UserRole): string {
  return role === "member" ? "/dashboard" : "/floor";
}

export default function LoginPage() {
  const router = useRouter();
  const { signIn, isMock } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn(email, password);

    if (result.error || !result.role) {
      setError(result.error ?? "Sign-in failed");
      setLoading(false);
      return;
    }

    router.replace(homeRouteFor(result.role));
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-surface-1 p-6 shadow-xl ">
      <h2 className="mb-1 text-xl font-semibold text-white">Sign in</h2>
      <p className="mb-6 text-sm text-white/50">Access your membership</p>

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
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
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
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60 transition-all duration-200 active:scale-[0.98]"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between text-xs">
        <Link
          href="/forgot-password"
          className="text-white/50 hover:text-accent"
        >
          Forgot password?
        </Link>
        <Link href="/register" className="text-white/50 hover:text-accent">
          Sign up
        </Link>
      </div>

      {isMock && (
        <div className="mt-6 rounded-lg border border-dashed border-white/10 bg-surface-1/80 p-3 text-xs text-white/60">
          <p className="mb-1 font-medium text-white/80">Mock mode</p>
          <p>
            Supabase isn&apos;t configured. Try one of:
          </p>
          <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-white/50">
            <li>member@tigress.test / password</li>
            <li>staff@tigress.test / password</li>
            <li>manager@tigress.test / password</li>
            <li>owner@tigress.test / password</li>
          </ul>
        </div>
      )}
    </div>
  );
}
