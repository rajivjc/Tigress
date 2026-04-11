import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

// Landing / redirect.
// Once auth is wired up, this will redirect authenticated users to /dashboard
// and unauthenticated users to /login.
export default function LandingPage() {
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
          href="/dashboard"
          className="rounded-lg border border-white/20 px-6 py-3 font-medium text-white transition-colors hover:bg-white/5"
        >
          View demo
        </Link>
      </div>
    </main>
  );
}
