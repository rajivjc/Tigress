// =============================================================================
// PendingApprovalsList (Session 24b1) — server component
// =============================================================================
// Mounted on the league detail page when the viewer captains at least one
// team registered in the competition. Lists every pending non-roster
// substitution they're entitled to approve / reject and renders an inline
// client-side action button per row.
// =============================================================================

import "server-only";
import {
  listPendingApprovalsForCaptain,
  type PendingApprovalRow,
} from "../data/lineups";
import { getPlayersByRefs } from "../data/players";
import { ApproveSubButton } from "./ApproveSubButton";

export interface PendingApprovalsListProps {
  competitionId: string;
  captainMemberId: string;
}

export async function PendingApprovalsList({
  competitionId,
  captainMemberId,
}: PendingApprovalsListProps) {
  const pending: PendingApprovalRow[] = await listPendingApprovalsForCaptain(
    captainMemberId,
    competitionId
  );
  if (pending.length === 0) return null;

  const playerMap = await getPlayersByRefs(
    pending.map((p) => ({ kind: "member" as const, id: p.subMemberId }))
  );

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <p className="mb-3 text-[10px] uppercase tracking-wider text-amber-200">
        Substitutions awaiting your approval ({pending.length})
      </p>
      <ul className="space-y-2">
        {pending.map((row, i) => {
          const player = playerMap.get(`member:${row.subMemberId}`);
          return (
            <li
              key={`${row.matchId}-${row.subEntrantId}-${row.subMemberId}-${i}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-surface-1/70 px-3 py-2"
            >
              <div className="text-sm text-white/90">
                {player?.displayName ?? row.subMemberId}
                <span className="ml-2 text-xs text-white/50">
                  on side {row.subSide.toUpperCase()}
                </span>
              </div>
              <ApproveSubButton
                matchId={row.matchId}
                entrantId={row.subEntrantId}
                side={row.subSide}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
