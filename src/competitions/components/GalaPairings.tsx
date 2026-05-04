// =============================================================================
// GalaPairings (Session 24a) — server component
// =============================================================================
// Renders the list of pairings inside a gala fixture. Each pairing is its own
// matchup with team names from the entrant lookup. Sub-match lineup forms
// land in S24b — for S24a we just surface the pairings with status text so
// the manager UI is complete enough to verify the data flow end-to-end.
// =============================================================================

import type { FixturePairing } from "../types";

export interface GalaPairingsProps {
  fixtureId: string;
  pairings: FixturePairing[];
  /** Maps team_id → display name. */
  teamNames: Map<string, string>;
}

export function GalaPairings({ pairings, teamNames }: GalaPairingsProps) {
  if (pairings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-surface-1/50 p-6 text-center text-xs text-white/50">
        No pairings yet — manager hasn&apos;t set them.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-surface-1/70">
      {pairings.map((p) => {
        const home = teamNames.get(p.home_team_id) ?? "Unknown";
        const away = teamNames.get(p.away_team_id) ?? "Unknown";
        return (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="text-sm text-white">
              {home} <span className="text-white/40">vs</span> {away}
            </div>
            <span className="text-[10px] uppercase tracking-wider text-white/50">
              #{p.pairing_order}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
