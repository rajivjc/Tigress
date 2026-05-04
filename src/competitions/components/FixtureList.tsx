// =============================================================================
// FixtureList (Session 23) — server component
// =============================================================================
// Grouped upcoming / completed list for a league. Each row links to the
// fixture detail page.
// =============================================================================

import Link from "next/link";
import type { EnrichedFixture } from "../data/fixtures";

export interface FixtureListProps {
  competitionId: string;
  fixtures: EnrichedFixture[];
  entrantNames: Map<string, string>;
}

export function FixtureList({
  competitionId,
  fixtures,
  entrantNames,
}: FixtureListProps) {
  if (fixtures.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-surface-1/50 p-6 text-center text-xs text-white/50">
        No fixtures scheduled yet.
      </div>
    );
  }
  const upcoming = fixtures.filter(
    (f) => f.fixture.status === "scheduled" || f.fixture.status === "in_progress"
  );
  const completed = fixtures.filter((f) => f.fixture.status === "completed");
  const other = fixtures.filter(
    (f) =>
      f.fixture.status === "postponed" || f.fixture.status === "cancelled"
  );

  return (
    <div className="space-y-4">
      {upcoming.length > 0 && (
        <FixtureGroup
          heading="Upcoming"
          fixtures={upcoming}
          entrantNames={entrantNames}
          competitionId={competitionId}
        />
      )}
      {completed.length > 0 && (
        <FixtureGroup
          heading="Completed"
          fixtures={completed}
          entrantNames={entrantNames}
          competitionId={competitionId}
        />
      )}
      {other.length > 0 && (
        <FixtureGroup
          heading="Other"
          fixtures={other}
          entrantNames={entrantNames}
          competitionId={competitionId}
        />
      )}
    </div>
  );
}

function FixtureGroup({
  heading,
  fixtures,
  entrantNames,
  competitionId,
}: {
  heading: string;
  fixtures: EnrichedFixture[];
  entrantNames: Map<string, string>;
  competitionId: string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] uppercase tracking-wider text-white/40">
        {heading}
      </h3>
      <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-surface-1/70">
        {fixtures.map((enriched) => {
          const f = enriched.fixture;
          const isGala = f.pairing_mode !== "two_team";
          const home = f.home_entrant_id
            ? entrantNames.get(f.home_entrant_id) ?? "TBD"
            : "TBD";
          const away = f.away_entrant_id
            ? entrantNames.get(f.away_entrant_id) ?? "TBD"
            : "TBD";
          let summary = "";
          if (
            !isGala &&
            f.status === "completed" &&
            enriched.subMatches.length > 0
          ) {
            const homeWins = enriched.subMatches.filter(
              (m) =>
                enriched.results.find((r) => r.match_id === m.id)
                  ?.winner_entrant_id === f.home_entrant_id
            ).length;
            const awayWins = enriched.subMatches.filter(
              (m) =>
                enriched.results.find((r) => r.match_id === m.id)
                  ?.winner_entrant_id === f.away_entrant_id
            ).length;
            summary = `${homeWins} – ${awayWins}`;
          }
          let label: React.ReactNode;
          if (f.is_bye) {
            label = (
              <p className="text-sm text-white/70">
                BYE <span className="text-white/40">— {home}</span>
              </p>
            );
          } else if (isGala) {
            label = (
              <p className="text-sm text-white">
                Gala — {f.pairing_mode.replace("gala_", "")}
              </p>
            );
          } else {
            label = (
              <p className="text-sm text-white">
                {home} <span className="text-white/40">vs</span> {away}
              </p>
            );
          }
          return (
            <li key={f.id}>
              <Link
                href={`/competitions/${competitionId}/fixtures/${f.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/40"
              >
                <div>
                  {label}
                  <p className="mt-1 flex items-center gap-2 text-[11px] text-white/50">
                    {f.round_number !== null && (
                      <span className="rounded border border-white/10 bg-surface-2/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/60">
                        Round {f.round_number}
                      </span>
                    )}
                    <span>{new Date(f.fixture_date).toLocaleDateString()}</span>
                    {isGala && (
                      <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-accent">
                        Gala
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  {summary && (
                    <p className="text-sm font-semibold text-white">{summary}</p>
                  )}
                  <p className="text-[10px] uppercase tracking-wider text-white/50">
                    {f.status.replace(/_/g, " ")}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
