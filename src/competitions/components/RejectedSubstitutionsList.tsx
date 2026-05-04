// =============================================================================
// RejectedSubstitutionsList (Session 24b1-fix) — server component
// =============================================================================
// Mirror of `PendingApprovalsList` for the OWN side: when the captain's
// substitute has been rejected, surface the row so they know to clear the
// lineup and submit a different player. Mounted on the league detail page
// alongside the pending list.
// =============================================================================

import "server-only";
import {
  listRejectedSubstitutionsForCaptain,
  type RejectedSubstitutionRow,
} from "../data/lineups";
import { getPlayersByRefs } from "../data/players";
import { ClearRejectedLineupButton } from "./ClearRejectedLineupButton";

export interface RejectedSubstitutionsListProps {
  competitionId: string;
  captainMemberId: string;
}

export async function RejectedSubstitutionsList({
  competitionId,
  captainMemberId,
}: RejectedSubstitutionsListProps) {
  const rejected: RejectedSubstitutionRow[] =
    await listRejectedSubstitutionsForCaptain(captainMemberId, competitionId);
  if (rejected.length === 0) return null;

  const refs: { kind: "member"; id: string }[] = [];
  for (const r of rejected) {
    refs.push({ kind: "member", id: r.subMemberId });
    if (r.rejectedByMemberId) {
      refs.push({ kind: "member", id: r.rejectedByMemberId });
    }
  }
  const playerMap = await getPlayersByRefs(refs);

  return (
    <section className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
      <p className="mb-3 text-[10px] uppercase tracking-wider text-rose-200">
        Substitutions you need to address ({rejected.length})
      </p>
      <ul className="space-y-2">
        {rejected.map((row, i) => {
          const subPlayer = playerMap.get(`member:${row.subMemberId}`);
          const rejectorPlayer = row.rejectedByMemberId
            ? playerMap.get(`member:${row.rejectedByMemberId}`)
            : null;
          return (
            <li
              key={`${row.matchId}-${row.subEntrantId}-${row.subMemberId}-${i}`}
              className="rounded-lg border border-white/10 bg-surface-1/70 px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-white/90">
                  {subPlayer?.displayName ?? row.subMemberId}
                  <span className="ml-2 text-xs text-white/50">
                    on side {row.subSide.toUpperCase()}
                  </span>
                  {rejectorPlayer && (
                    <span className="ml-2 text-xs text-white/50">
                      — rejected by {rejectorPlayer.displayName}
                    </span>
                  )}
                </div>
                <ClearRejectedLineupButton
                  matchId={row.matchId}
                  side={row.subSide}
                />
              </div>
              {row.approvalNote && (
                <p className="mt-1 text-xs text-white/60">
                  Note: &ldquo;{row.approvalNote}&rdquo;
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
