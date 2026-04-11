"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

/**
 * Auth-aware controls shown on the right side of the mobile AppHeader.
 * Displays the user's name/role and a sign-out icon button so that mobile
 * staff/owners (whose desktop sidebar is hidden) can always log out.
 */
export function HeaderAuthControls() {
  const router = useRouter();
  const { profile, role, signOut, isLoading } = useAuth();
  const [loading, setLoading] = useState(false);

  if (isLoading || !profile || !role) {
    return null;
  }

  const handleSignOut = async () => {
    setLoading(true);
    await signOut();
    router.replace("/login");
  };

  const firstName = profile.full_name.split(" ")[0];

  return (
    <div className="flex items-center gap-2">
      <div className="text-right leading-tight">
        <div className="truncate text-xs font-medium text-white">
          {firstName}
        </div>
        <div className="truncate text-[10px] uppercase tracking-wider text-white/40">
          {role}
        </div>
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={loading}
        aria-label="Sign out"
        title="Sign out"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/70 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
      >
        {/* Logout glyph */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  );
}
