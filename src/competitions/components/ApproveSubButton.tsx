"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveLineupSubstitutionAction } from "../actions/lineup-approvals";
import type { LineupSide } from "../types";

export interface ApproveSubButtonProps {
  matchId: string;
  entrantId: string;
  side: LineupSide;
}

export function ApproveSubButton({
  matchId,
  entrantId,
  side,
}: ApproveSubButtonProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const decide = (decision: "approved" | "rejected") => {
    startTransition(async () => {
      setError(null);
      const res = await approveLineupSubstitutionAction({
        matchId,
        entrantId,
        side,
        decision,
      });
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
        onClick={() => decide("approved")}
        className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("rejected")}
        className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
      >
        Reject
      </button>
      {error && <span className="text-xs text-rose-300">{error}</span>}
    </div>
  );
}
