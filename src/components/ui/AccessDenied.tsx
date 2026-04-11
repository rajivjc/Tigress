"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/lib/types";

function homeRouteFor(role: UserRole | null): string {
  if (!role) return "/login";
  return role === "member" ? "/dashboard" : "/floor";
}

export function AccessDenied() {
  const router = useRouter();
  const { role, signOut } = useAuth();

  const handleGoHome = () => {
    router.replace(homeRouteFor(role));
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface-1 p-6 text-center shadow-xl ">
        <div className="mb-3 inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-accent">
          403
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-white">
          Access denied
        </h1>
        <p className="mb-6 text-sm text-white/60">
          You don&apos;t have permission to view this page.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleGoHome}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-all duration-200 active:scale-[0.98]"
          >
            Go to my home
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
