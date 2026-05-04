"use client";

// =============================================================================
// GenerateScheduleForm (Session 24a) — manager-facing schedule generator UI
// =============================================================================
// Mounted on the league detail page; calls `generateSeasonFixtures` with the
// chosen mode + cadence. Mock-mode aware via the action.
// =============================================================================

import { useState, useTransition } from "react";
import { generateSeasonFixtures } from "../actions/schedule-generator";

export interface GenerateScheduleFormProps {
  seasonId: string;
  divisionId: string;
}

export function GenerateScheduleForm({
  seasonId,
  divisionId,
}: GenerateScheduleFormProps) {
  const [mode, setMode] = useState<"empty" | "append" | "regenerate">("empty");
  const [rounds, setRounds] = useState<1 | 2>(1);
  const [startDate, setStartDate] = useState("");
  const [cadenceWeeks, setCadenceWeeks] = useState("1");
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const cadenceVal = Number(cadenceWeeks);
      const res = await generateSeasonFixtures({
        seasonId,
        divisionId,
        mode,
        rounds,
        startDate: startDate || undefined,
        cadence:
          startDate && cadenceVal > 0
            ? { unit: "week", value: cadenceVal }
            : undefined,
        confirmRegenerate: mode === "regenerate" ? confirmRegenerate : undefined,
      });
      if (res.success) {
        setMessage(
          res.wiped !== undefined
            ? `Wiped ${res.wiped} and generated ${res.generated} fixtures.`
            : `Generated ${res.generated} fixtures.`
        );
      } else {
        setMessage(`Error: ${res.error}`);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-white/40">Mode</p>
        <div className="flex gap-2 text-xs">
          {(["empty", "append", "regenerate"] as const).map((m) => (
            <label key={m} className="flex items-center gap-1.5 text-white/80">
              <input
                type="radio"
                name="mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              {m}
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <label className="text-xs text-white/80">
          Rounds:&nbsp;
          <select
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value) === 2 ? 2 : 1)}
            className="rounded border border-white/10 bg-surface-2 px-2 py-1 text-white"
          >
            <option value={1}>Single (1)</option>
            <option value={2}>Double (2)</option>
          </select>
        </label>
        <label className="text-xs text-white/80">
          Start date:&nbsp;
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-white/10 bg-surface-2 px-2 py-1 text-white"
          />
        </label>
        <label className="text-xs text-white/80">
          Weeks/round:&nbsp;
          <input
            type="number"
            min={1}
            value={cadenceWeeks}
            onChange={(e) => setCadenceWeeks(e.target.value)}
            className="w-16 rounded border border-white/10 bg-surface-2 px-2 py-1 text-white"
          />
        </label>
      </div>
      {mode === "regenerate" && (
        <label className="flex items-center gap-2 text-xs text-rose-300">
          <input
            type="checkbox"
            checked={confirmRegenerate}
            onChange={(e) => setConfirmRegenerate(e.target.checked)}
          />
          I understand this will wipe existing fixtures.
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-white/10 bg-accent/20 px-3 py-2 text-xs font-medium text-white hover:bg-accent/30 disabled:opacity-50"
      >
        {pending ? "Generating..." : "Generate fixtures"}
      </button>
      {message && (
        <p className="text-xs text-white/70">{message}</p>
      )}
    </form>
  );
}
