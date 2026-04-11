"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface LogoutButtonProps {
  variant?: "sidebar" | "inline";
  className?: string;
}

export function LogoutButton({
  variant = "inline",
  className,
}: LogoutButtonProps) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    await signOut();
    router.replace("/login");
  };

  const base =
    variant === "sidebar"
      ? "block w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
      : "rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 disabled:opacity-50";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={className ?? base}
    >
      {loading ? "Signing out..." : "Sign out"}
    </button>
  );
}
