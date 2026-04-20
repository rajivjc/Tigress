// =============================================================================
// CompetitionDetail (server component)
// =============================================================================
// Read-only viewer of a single competition in S21. Shows metadata,
// entrants with Player adapter-resolved subject, and a flat match list.
// Write controls (add entrant / record result) land incrementally alongside
// the bracket generator in S22+.
// =============================================================================

import type {
  Competition,
  EnrichedEntrant,
  GameType,
  Match,
} from "../types";

export interface CompetitionDetailProps {
  competition: Competition;
  entrants: EnrichedEntrant[];
  matches: Match[];
  gameTypes: GameType[];
}

export function CompetitionDetail({
  competition,
  entrants,
  matches,
  gameTypes,
}: CompetitionDetailProps) {
  const gameType = gameTypes.find((g) => g.id === competition.game_type_id);

  return (
    <div className="space-y-6">
      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{competition.name}</h1>
            {competition.description && (
              <p className="mt-1 text-sm text-white/60">
                {competition.description}
              </p>
            )}
          </div>
          <StatusPill status={competition.status} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
          <Meta label="Kind" value={competition.kind} />
          {competition.format && <Meta label="Format" value={competition.format.replace("_", " ")} />}
          <Meta label="Entrants" value={competition.entrant_type} />
          <Meta
            label="Game"
            value={gameType?.display_name ?? competition.game_type_id}
          />
          <Meta label="Guest policy" value={competition.guest_policy.replace(/_/g, " ")} />
          {competition.starts_at && (
            <Meta
              label="Starts"
              value={new Date(competition.starts_at).toLocaleString()}
            />
          )}
        </dl>

        {competition.team_match_config && (
          <div className="mt-4">
            <div className="mb-1 text-[11px] uppercase tracking-wider text-white/40">
              Team match config
            </div>
            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-surface-2/70 p-3 text-[11px] text-white/70">
              {JSON.stringify(competition.team_match_config, null, 2)}
            </pre>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
          Entrants ({entrants.length})
        </h2>
        {entrants.length === 0 ? (
          <EmptyPanel text="No entrants yet. Add one from the admin actions to seed the draft." />
        ) : (
          <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-surface-1/70">
            {entrants.map((enriched) => (
              <li
                key={enriched.entrant.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-surface-2 text-[11px] text-white/60">
                    {enriched.entrant.seed_number ?? "—"}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-white">
                      {subjectLabel(enriched)}
                    </div>
                    <div className="text-[11px] text-white/40">
                      {subjectMeta(enriched)}
                    </div>
                  </div>
                </div>
                <StatusPill small status={enriched.entrant.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
          Matches ({matches.length})
        </h2>
        {matches.length === 0 ? (
          <EmptyPanel text="No matches recorded yet." />
        ) : (
          <ul className="space-y-2">
            {matches.map((m) => (
              <li
                key={m.id}
                className="rounded-xl border border-white/10 bg-surface-1/70 px-4 py-3 text-sm text-white"
              >
                <div className="flex items-center justify-between gap-3">
                  <span>
                    {m.round_number !== null
                      ? `Round ${m.round_number}`
                      : "Match"}
                    {m.bracket_position !== null
                      ? ` · position ${m.bracket_position}`
                      : ""}
                  </span>
                  <StatusPill small status={m.status} />
                </div>
                <div className="mt-1 text-[11px] text-white/50">
                  Race-to {m.race_to_a} vs {m.race_to_b} · {m.game_type_id}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------- Helpers ----------

function subjectLabel(e: EnrichedEntrant): string {
  if (!e.subject) return "Unknown entrant";
  if (e.subject.kind === "player") return e.subject.player.displayName;
  return e.subject.team.name;
}

function subjectMeta(e: EnrichedEntrant): string {
  if (!e.subject) return "—";
  if (e.subject.kind === "player") {
    const p = e.subject.player;
    if (p.kind === "member") {
      return p.skillLevel !== null ? `Member · SL ${p.skillLevel}` : "Member";
    }
    if (p.kind === "guest") {
      return p.isPaying ? "Guest (paying)" : "Guest";
    }
    return `Staff · ${p.role}`;
  }
  const captain = e.subject.captain;
  return captain ? `Team · captain ${captain.displayName}` : "Team";
}

function StatusPill({
  status,
  small,
}: {
  status: string;
  small?: boolean;
}) {
  const pretty = status.replace(/_/g, " ");
  return (
    <span
      className={`rounded-full border border-white/15 bg-surface-2/70 uppercase tracking-wider text-white/70 ${
        small ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-[11px]"
      }`}
    >
      {pretty}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </dt>
      <dd className="text-sm text-white/80">{value}</dd>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-surface-1/50 p-6 text-center text-xs text-white/50">
      {text}
    </div>
  );
}
