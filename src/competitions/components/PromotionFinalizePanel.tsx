"use client";

// =============================================================================
// Competitions — promotion finalize panel (Session 24b2)
// =============================================================================
// Manager-facing UI for closing out a division's season. Shows the
// promote/relegate counts, lets the manager attach overrides for tied
// boundaries, and surfaces the action's structured error responses
// (incomplete fixtures, replay-required pending, missing target divisions,
// boundary ties).
// =============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  finalizeDivisionPromotionsAction,
  type FinalizePromotionsResult,
} from "../actions/promotion";
import type { Division } from "../types";

interface OverrideDraft {
  decision: "promote" | "relegate" | "stay";
  note: string;
}

export function PromotionFinalizePanel({
  division,
  divisionEntrantNames,
}: {
  division: Division;
  /** entrantId → displayName (team name) for the manager's mental model. */
  divisionEntrantNames: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, OverrideDraft>>({});
  const [result, setResult] = useState<FinalizePromotionsResult | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const overridesPayload = Object.entries(overrides)
      .filter(([, v]) => v.note.trim().length > 0)
      .map(([entrantId, v]) => ({ entrantId, ...v, note: v.note.trim() }));
    startTransition(async () => {
      const res = await finalizeDivisionPromotionsAction({
        divisionId: division.id,
        confirm,
        overrides: overridesPayload,
      });
      setResult(res);
      if (res.success) router.refresh();
    });
  };

  const tied = !result?.success && result?.ties;

  return (
    <section className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-4">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-amber-200/80">
        Season-end · finalize promotions
      </p>
      <p className="mb-3 text-xs text-white/70">
        {division.tier_name} (tier {division.tier}). Promote{" "}
        {division.promote_count}, relegate {division.relegate_count}. Decisions
        are recorded in <code className="text-white/80">comp_promotion_decisions</code>{" "}
        and cannot be undone.
      </p>

      {tied && result && !result.success && result.ties && (
        <div className="mb-3 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-100">
          <p className="font-medium">Tied at boundary position {result.ties.position}</p>
          <p className="mt-1 text-rose-100/80">
            Each tied entrant needs an explicit override + note to break the tie.
          </p>
          <ul className="mt-2 space-y-2">
            {result.ties.entrantIds.map((id) => (
              <li key={id} className="rounded border border-white/10 bg-surface-2/70 p-2">
                <p className="text-white">
                  {divisionEntrantNames[id] ?? id}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={overrides[id]?.decision ?? "stay"}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        [id]: {
                          decision: e.target.value as OverrideDraft["decision"],
                          note: prev[id]?.note ?? "",
                        },
                      }))
                    }
                    className="rounded border border-white/10 bg-surface-2 px-2 py-1 text-white"
                  >
                    <option value="promote">Promote</option>
                    <option value="stay">Stay</option>
                    <option value="relegate">Relegate</option>
                  </select>
                  <input
                    value={overrides[id]?.note ?? ""}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        [id]: {
                          decision: prev[id]?.decision ?? "stay",
                          note: e.target.value,
                        },
                      }))
                    }
                    placeholder="Reason (required)"
                    className="flex-1 rounded border border-white/10 bg-surface-2 px-2 py-1 text-white"
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && !result.success && result.incompleteFixtureIds && (
        <div className="mb-3 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-100">
          <p className="font-medium">{result.incompleteFixtureIds.length} fixtures still need a result</p>
          <ul className="mt-1 list-inside list-disc text-rose-100/80">
            {result.incompleteFixtureIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </div>
      )}

      {result && !result.success && result.replayRequired && (
        <div className="mb-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p className="font-medium">{result.replayRequired.length} replay required before finalize</p>
        </div>
      )}

      {result && !result.success && result.missingTargets && (
        <div className="mb-3 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-100">
          <p className="font-medium">Set up the next season&apos;s divisions first</p>
          <ul className="mt-1 list-inside list-disc text-rose-100/80">
            {result.missingTargets.map((m, i) => (
              <li key={i}>
                {m.leagueName} · tier {m.tier}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && !result.success && result.error === "NEXT_SEASON_NOT_SET_UP" && (
        <div className="mb-3 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-100">
          <p>Set this season&apos;s &quot;next season&quot; pointer first on the seasons page.</p>
        </div>
      )}

      {result && !result.success && !result.ties && !result.replayRequired
        && !result.missingTargets && !result.incompleteFixtureIds
        && result.error !== "NEXT_SEASON_NOT_SET_UP" && (
          <div className="mb-3 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-100">
            {result.error}
          </div>
        )}

      {result && result.success && (
        <div className="mb-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-xs text-emerald-100">
          Finalized — {result.promoted} promoted, {result.relegated} relegated,{" "}
          {result.stayed} stayed.
        </div>
      )}

      <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
          />
          I&apos;ve reviewed the standings.
        </label>
        <button
          type="submit"
          disabled={pending || !confirm}
          className="rounded-lg bg-amber-500/80 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "Finalizing…" : "Finalize promotions"}
        </button>
      </form>
    </section>
  );
}
