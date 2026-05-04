"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearLineupAction } from "../actions/lineups";
import type { LineupSide } from "../types";

export interface ClearRejectedLineupButtonProps {
  matchId: string;
  side: LineupSide;
}

export function ClearRejectedLineupButton({
  matchId,
  side,
}: ClearRejectedLineupButtonProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onClick = () => {
    startTransition(async () => {
      setError(null);
      const res = await clearLineupAction(matchId, side);
      if (!res.success) {
        setError(res.error ?? "Failed");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
      >
        Clear lineup
      </button>
      {error && <span className="text-xs text-rose-300">{error}</span>}
    </div>
  );
}
