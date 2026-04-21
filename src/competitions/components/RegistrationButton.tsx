"use client";

// =============================================================================
// RegistrationButton — member register / withdraw CTA (Session 22)
// =============================================================================

import { useState, useTransition } from "react";
import {
  registerForTournamentAction,
  withdrawFromTournamentAction,
} from "../actions/registration";

interface RegistrationButtonProps {
  competitionId: string;
  isRegistered: boolean;
  /** When true, "Withdraw" shows a confirm step before firing the action. */
  requireConfirmOnWithdraw?: boolean;
}

export function RegistrationButton({
  competitionId,
  isRegistered,
  requireConfirmOnWithdraw = false,
}: RegistrationButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function fire(action: "register" | "withdraw") {
    setError(null);
    startTransition(async () => {
      const res =
        action === "register"
          ? await registerForTournamentAction(competitionId)
          : await withdrawFromTournamentAction(competitionId);
      if (!res.success) {
        setError(res.error ?? "Failed");
      }
      setConfirming(false);
    });
  }

  if (!isRegistered) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => fire("register")}
          disabled={isPending}
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-60"
        >
          {isPending ? "Registering…" : "Register"}
        </button>
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    );
  }

  if (requireConfirmOnWithdraw && !confirming) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={isPending}
          className="w-full rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-surface-2"
        >
          Withdraw
        </button>
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="space-y-2 rounded-lg border border-rose-400/30 bg-rose-400/5 p-3">
        <p className="text-xs text-white/70">
          Withdrawing now will forfeit any matches you&apos;re playing.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fire("withdraw")}
            disabled={isPending}
            className="flex-1 rounded bg-rose-500 px-3 py-1.5 text-xs text-white disabled:opacity-60"
          >
            {isPending ? "Withdrawing…" : "Confirm withdraw"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="rounded border border-white/15 px-3 py-1.5 text-xs text-white/70"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => fire("withdraw")}
        disabled={isPending}
        className="w-full rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-surface-2"
      >
        {isPending ? "Withdrawing…" : "Withdraw"}
      </button>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
