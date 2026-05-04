// =============================================================================
// Competitions — promotion history panel (Session 24b2)
// =============================================================================
// Read-only display of past promote/relegate/stay decisions for a finalized
// division. Shown instead of the finalize panel after the action has run.
// =============================================================================

import type { Division, PromotionDecision } from "../types";

export function PromotionHistoryPanel({
  division,
  decisions,
  entrantNames,
  divisionNames,
  finalizerName,
}: {
  division: Division;
  decisions: PromotionDecision[];
  /** entrantId → display name (team) for source rows. */
  entrantNames: Record<string, string>;
  /** divisionId → human label for target divisions. */
  divisionNames: Record<string, string>;
  /** Optional name of the manager who finalized — falls back to id. */
  finalizerName?: string;
}) {
  if (division.promotions_finalized_at === null) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-surface-1/70 p-4">
      <p className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
        Promotions history
      </p>
      <p className="mb-3 text-xs text-white/60">
        Finalized {new Date(division.promotions_finalized_at).toLocaleString()}{" "}
        by {finalizerName ?? division.promotions_finalized_by}.
      </p>
      <ul className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
        {decisions.map((d) => (
          <li key={d.id} className="space-y-1 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-white">
                #{d.source_position} {entrantNames[d.source_entrant_id] ?? d.source_entrant_id}
              </p>
              <span
                className={
                  "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                  (d.decision === "promote"
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                    : d.decision === "relegate"
                      ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
                      : "border-white/10 bg-surface-2 text-white/70")
                }
              >
                {d.decision}
              </span>
            </div>
            <p className="text-white/60">
              → {divisionNames[d.target_division_id] ?? d.target_division_id}
              {d.was_manual_override && d.override_note && (
                <span className="ml-2 text-amber-300/80">
                  override: {d.override_note}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
