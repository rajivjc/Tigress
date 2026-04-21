"use client";

// =============================================================================
// ReportResultButton — inline modal trigger (Session 22)
// =============================================================================
// Small client component that lives inside each <MatchCard/>. For members,
// it opens the "report result" dialog; for managers with the override flag,
// it opens a wider form that lets them pick any winner and cascade-revert
// downstream completed matches.
// =============================================================================

import { useState, useTransition } from "react";
import {
  overrideMatchResultAction,
  reportMatchResultAction,
} from "../actions/results";

interface ReportResultButtonProps {
  matchId: string;
  entrantAId: string;
  entrantBId: string;
  entrantAName: string;
  entrantBName: string;
  currentEntrantId: string | null;
  raceToA: number;
  raceToB: number;
  /** When true, uses overrideMatchResultAction and shows cascade-revert UI. */
  managerOverride?: boolean;
  /** Only meaningful with managerOverride. */
  hasExistingResult?: boolean;
}

export function ReportResultButton(props: ReportResultButtonProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
          props.managerOverride
            ? "border border-white/15 text-white/60 hover:bg-surface-2 hover:text-white"
            : "bg-accent text-white hover:bg-accent/90"
        }`}
      >
        {props.managerOverride
          ? props.hasExistingResult
            ? "Override"
            : "Record result"
          : "Report result"}
      </button>
    );
  }

  return <ResultForm {...props} onClose={() => setOpen(false)} />;
}

function ResultForm(
  props: ReportResultButtonProps & { onClose: () => void }
) {
  const defaultWinner =
    !props.managerOverride && props.currentEntrantId !== null
      ? props.currentEntrantId
      : props.entrantAId;
  const [winnerId, setWinnerId] = useState<string>(defaultWinner);
  const [scoreA, setScoreA] = useState<number>(
    defaultWinner === props.entrantAId ? props.raceToA : 0
  );
  const [scoreB, setScoreB] = useState<number>(
    defaultWinner === props.entrantBId ? props.raceToB : 0
  );
  const [cascadeRevert, setCascadeRevert] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const input = {
        matchId: props.matchId,
        winnerEntrantId: winnerId,
        scoreA,
        scoreB,
      };
      const res = props.managerOverride
        ? await overrideMatchResultAction({
            ...input,
            cascadeRevert,
          })
        : await reportMatchResultAction(input);
      if (!res.success) {
        setError(res.error ?? "Failed to record result");
        return;
      }
      props.onClose();
    });
  }

  return (
    <div
      data-testid="result-form"
      className="mt-2 space-y-2 rounded-lg border border-white/10 bg-surface-2/50 p-2 text-[11px]"
    >
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name={`winner-${props.matchId}`}
            checked={winnerId === props.entrantAId}
            onChange={() => {
              setWinnerId(props.entrantAId);
              setScoreA(props.raceToA);
              setScoreB(0);
            }}
            disabled={
              !props.managerOverride &&
              props.currentEntrantId !== null &&
              props.currentEntrantId !== props.entrantAId
            }
          />
          <span className="truncate">{props.entrantAName}</span>
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={Math.max(props.raceToA, props.raceToB)}
          value={scoreA}
          onChange={(e) => setScoreA(Number(e.target.value))}
          className="w-12 rounded bg-surface-1 px-1.5 py-0.5 text-right text-white"
          aria-label={`Score for ${props.entrantAName}`}
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name={`winner-${props.matchId}`}
            checked={winnerId === props.entrantBId}
            onChange={() => {
              setWinnerId(props.entrantBId);
              setScoreA(0);
              setScoreB(props.raceToB);
            }}
            disabled={
              !props.managerOverride &&
              props.currentEntrantId !== null &&
              props.currentEntrantId !== props.entrantBId
            }
          />
          <span className="truncate">{props.entrantBName}</span>
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={Math.max(props.raceToA, props.raceToB)}
          value={scoreB}
          onChange={(e) => setScoreB(Number(e.target.value))}
          className="w-12 rounded bg-surface-1 px-1.5 py-0.5 text-right text-white"
          aria-label={`Score for ${props.entrantBName}`}
        />
      </div>

      {props.managerOverride && (
        <label className="flex items-center gap-1.5 text-[10px] text-white/60">
          <input
            type="checkbox"
            checked={cascadeRevert}
            onChange={(e) => setCascadeRevert(e.target.checked)}
          />
          <span>
            Cascade revert downstream (required if a later match has already
            been played)
          </span>
        </label>
      )}

      {error && <p className="text-[10px] text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="flex-1 rounded bg-accent px-2 py-1 text-[11px] font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={props.onClose}
          disabled={isPending}
          className="rounded border border-white/15 px-2 py-1 text-[11px] text-white/70"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
