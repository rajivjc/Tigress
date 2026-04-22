"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reportSubMatchResultAction } from "../actions/league-results";

export interface ReportSubMatchButtonProps {
  matchId: string;
  entrantAId: string;
  entrantAName: string;
  entrantBId: string;
  entrantBName: string;
  raceToA: number;
  raceToB: number;
}

export function ReportSubMatchButton(props: ReportSubMatchButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [winner, setWinner] = useState<string>(props.entrantAId);
  const [scoreA, setScoreA] = useState<number>(props.raceToA);
  const [scoreB, setScoreB] = useState<number>(0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await reportSubMatchResultAction({
        matchId: props.matchId,
        winnerEntrantId: winner,
        scoreA,
        scoreB,
      });
      if (!res.success) {
        alert(res.error ?? "Failed");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/80 hover:bg-surface-2"
      >
        Report result
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-white/10 bg-surface-2 p-3">
      <div className="flex gap-2 text-xs">
        <label className="flex items-center gap-1 text-white/80">
          <input
            type="radio"
            checked={winner === props.entrantAId}
            onChange={() => setWinner(props.entrantAId)}
          />
          {props.entrantAName}
        </label>
        <label className="flex items-center gap-1 text-white/80">
          <input
            type="radio"
            checked={winner === props.entrantBId}
            onChange={() => setWinner(props.entrantBId)}
          />
          {props.entrantBName}
        </label>
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          max={props.raceToA}
          value={scoreA}
          onChange={(e) => setScoreA(parseInt(e.target.value, 10) || 0)}
          className="w-20 rounded border border-white/10 bg-surface-3 px-2 py-1 text-sm text-white"
        />
        <span className="self-center text-white/40">–</span>
        <input
          type="number"
          min={0}
          max={props.raceToB}
          value={scoreB}
          onChange={(e) => setScoreB(parseInt(e.target.value, 10) || 0)}
          className="w-20 rounded border border-white/10 bg-surface-3 px-2 py-1 text-sm text-white"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-white/10 px-3 py-1 text-xs text-white/70"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
