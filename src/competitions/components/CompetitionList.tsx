// =============================================================================
// CompetitionList (server component)
// =============================================================================
// Lists all competitions with summary chips. Grouped by status so owners
// can see drafts separate from live and archived competitions.
// =============================================================================

import Link from "next/link";
import { Trophy } from "lucide-react";
import type {
  Competition,
  CompetitionStatus,
  GameType,
} from "../types";

const STATUS_ORDER: CompetitionStatus[] = [
  "draft",
  "registration_open",
  "in_progress",
  "completed",
  "cancelled",
];

const STATUS_LABELS: Record<CompetitionStatus, string> = {
  draft: "Drafts",
  registration_open: "Registration open",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const KIND_LABELS: Record<Competition["kind"], string> = {
  tournament: "Tournament",
  league: "League",
  ladder: "Ladder",
  casual: "Casual",
};

export interface CompetitionListProps {
  competitions: Competition[];
  gameTypes: Map<string, GameType>;
}

export function CompetitionList({
  competitions,
  gameTypes,
}: CompetitionListProps) {
  if (competitions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-surface-1/50 p-8 text-center text-sm text-white/50">
        <Trophy
          size={28}
          strokeWidth={1.5}
          className="mx-auto mb-2 text-white/30"
        />
        No competitions yet. Create the first draft to get started.
      </div>
    );
  }

  const byStatus = new Map<CompetitionStatus, Competition[]>();
  for (const c of competitions) {
    const list = byStatus.get(c.status) ?? [];
    list.push(c);
    byStatus.set(c.status, list);
  }

  return (
    <div className="space-y-6">
      {STATUS_ORDER.filter((s) => (byStatus.get(s) ?? []).length > 0).map(
        (status) => (
          <section key={status}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
              {STATUS_LABELS[status]}
            </h2>
            <ul className="space-y-2">
              {(byStatus.get(status) ?? []).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/competitions/${c.id}`}
                    className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-surface-1/70 px-4 py-3 transition-colors hover:bg-surface-2/70"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">
                          {c.name}
                        </span>
                        <Badge label={KIND_LABELS[c.kind]} />
                        {c.format && <Badge label={c.format.replace("_", " ")} />}
                        <Badge
                          label={
                            c.entrant_type === "team" ? "Team" : "Individual"
                          }
                        />
                        <Badge
                          label={
                            gameTypes.get(c.game_type_id)?.display_name ??
                            c.game_type_id
                          }
                        />
                      </div>
                      {c.description && (
                        <p className="mt-1 line-clamp-1 text-xs text-white/50">
                          {c.description}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/15 bg-surface-2/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
      {label}
    </span>
  );
}
