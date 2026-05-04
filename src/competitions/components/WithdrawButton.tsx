"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { withdrawFromTournamentAction } from "../actions/registration";

export function WithdrawButton({ competitionId }: { competitionId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleWithdraw = () => {
    if (
      !window.confirm(
        "Withdraw from this in-progress tournament? Your matches become walkovers for your opponents."
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await withdrawFromTournamentAction(competitionId);
      if (!res.success) {
        window.alert(res.error ?? "Failed to withdraw");
        return;
      }
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleWithdraw}
      disabled={pending}
      className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
    >
      {pending ? "Withdrawing…" : "Withdraw from tournament"}
    </button>
  );
}
