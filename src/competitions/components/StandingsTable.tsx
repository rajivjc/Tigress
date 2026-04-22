// =============================================================================
// StandingsTable (Session 23) — server component
// =============================================================================
// Renders computeStandings output as a readable league table.
// =============================================================================

import type { StandingsRow } from "../lib/standings";

export interface StandingsTableProps {
  rows: StandingsRow[];
  entrantNames: Map<string, string>;
  highlightEntrantId?: string | null;
}

export function StandingsTable({
  rows,
  entrantNames,
  highlightEntrantId = null,
}: StandingsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-surface-1/50 p-6 text-center text-xs text-white/50">
        No entrants yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-1/70">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-white/50">
          <tr>
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Team</th>
            <th className="px-2 py-2 text-center">P</th>
            <th className="px-2 py-2 text-center">W</th>
            <th className="px-2 py-2 text-center">D</th>
            <th className="px-2 py-2 text-center">L</th>
            <th className="px-2 py-2 text-center">+/-</th>
            <th className="px-3 py-2 text-right">Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map((row) => {
            const highlighted = highlightEntrantId === row.entrantId;
            const name = entrantNames.get(row.entrantId) ?? "Unknown";
            return (
              <tr
                key={row.entrantId}
                className={
                  highlighted ? "bg-accent/10 text-white" : "text-white/80"
                }
              >
                <td className="px-3 py-2 text-white/60">{row.position}</td>
                <td className="px-3 py-2 font-medium">{name}</td>
                <td className="px-2 py-2 text-center">{row.played}</td>
                <td className="px-2 py-2 text-center">{row.won}</td>
                <td className="px-2 py-2 text-center">{row.drawn}</td>
                <td className="px-2 py-2 text-center">{row.lost}</td>
                <td className="px-2 py-2 text-center">
                  {row.subMatchDiff > 0 ? `+${row.subMatchDiff}` : row.subMatchDiff}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-white">
                  {row.points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
