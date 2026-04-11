"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";

// Landing page. Authenticated users are redirected to their role-based home.
// Unauthenticated visitors see the marketing splash with a Sign-in button.
export default function LandingPage() {
  const router = useRouter();
  const { role, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!role) return;
    router.replace(role === "member" ? "/dashboard" : "/floor");
  }, [isLoading, role, router]);

  if (isLoading || role) {
    return <LoadingSkeleton />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-8">
        <h1 className="text-5xl font-bold tracking-tight text-white md:text-6xl">
          {APP_NAME}
          <span className="text-accent">.</span>
        </h1>
        <p className="mt-3 text-sm uppercase tracking-[0.3em] text-white/40">
          Bar &middot; Billiards &middot; Club
        </p>
      </div>

      <p className="mb-10 max-w-md text-white/60">
        Club management platform for a bar &amp; billiards venue — bookings,
        floor ops, members, and more.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="rounded-lg bg-accent px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-lg border border-white/20 px-6 py-3 font-medium text-white transition-colors hover:bg-white/5"
        >
          Sign up
        </Link>
      </div>
    </main>
  );
}
