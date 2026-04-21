"use client";

// =============================================================================
// PublishBracketButton — manager CTA (Session 22)
// =============================================================================

import { useTransition, useState } from "react";
import {
  clearBracketAction,
  publishBracketAction,
} from "../actions/bracket";

interface PublishBracketButtonProps {
  competitionId: string;
  canPublish: boolean;
  canClear: boolean;
  entrantCount: number;
}

export function PublishBracketButton({
  competitionId,
  canPublish,
  canClear,
  entrantCount,
}: PublishBracketButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function fire(action: "publish" | "clear") {
    setError(null);
    startTransition(async () => {
      const res =
        action === "publish"
          ? await publishBracketAction(competitionId)
          : await clearBracketAction(competitionId);
      if (!res.success) setError(res.error ?? "Failed");
    });
  }

  return (
    <div className="space-y-1">
      {canPublish && (
        <button
          type="button"
          onClick={() => fire("publish")}
          disabled={isPending || entrantCount < 2}
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-60"
        >
          {isPending
            ? "Publishing…"
            : entrantCount < 2
              ? "Need ≥ 2 entrants to publish"
              : `Publish bracket (${entrantCount} entrants)`}
        </button>
      )}
      {canClear && (
        <button
          type="button"
          onClick={() => fire("clear")}
          disabled={isPending}
          className="w-full rounded-lg border border-rose-400/30 px-4 py-2 text-xs text-rose-300 hover:bg-rose-400/10 disabled:opacity-60"
        >
          {isPending ? "Clearing…" : "Clear bracket (returns to registration)"}
        </button>
      )}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
