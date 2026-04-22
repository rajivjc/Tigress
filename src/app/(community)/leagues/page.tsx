import Link from "next/link";
import { Trophy } from "lucide-react";
import { getCurrentStaff } from "@/lib/data/staff";
import { listCompetitions } from "@/competitions/data/competitions";
import { listDivisions } from "@/competitions/data/divisions";
import { listSeasons } from "@/competitions/data/seasons";

export const dynamic = "force-dynamic";

export default async function LeaguesPage() {
  const staff = await getCurrentStaff();
  const isOwner = staff?.role === "owner";

  const [competitions, seasons, divisions] = await Promise.all([
    listCompetitions({ kind: "league" }),
    listSeasons(),
    listDivisions(),
  ]);
  const seasonMap = new Map(seasons.map((s) => [s.id, s]));
  const divisionMap = new Map(divisions.map((d) => [d.id, d]));

  return (
    <div className="space-y-6 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">Compete</p>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <Trophy size={20} className="text-accent" strokeWidth={1.5} />
          Leagues
        </h1>
        <p className="mt-1 text-xs text-white/50">
          Team-based leagues across seasons and divisions.
        </p>
      </header>

      {isOwner && (
        <div className="flex gap-2">
          <Link
            href="/leagues/seasons"
            className="rounded-lg border border-white/10 bg-surface-1/70 px-3 py-2 text-xs text-white/80 hover:bg-surface-2"
          >
            Manage seasons
          </Link>
          <Link
            href="/leagues/divisions"
            className="rounded-lg border border-white/10 bg-surface-1/70 px-3 py-2 text-xs text-white/80 hover:bg-surface-2"
          >
            Manage divisions
          </Link>
        </div>
      )}

      {competitions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-surface-1/50 p-6 text-center text-xs text-white/50">
          No leagues yet.
        </div>
      ) : (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-surface-1/70">
          {competitions.map((comp) => {
            const division = comp.division_id
              ? divisionMap.get(comp.division_id)
              : null;
            const season = division ? seasonMap.get(division.season_id) : null;
            return (
              <li key={comp.id}>
                <Link
                  href={`/competitions/${comp.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/40"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{comp.name}</p>
                    <p className="mt-1 text-[11px] text-white/50">
                      {season?.name ?? "—"} ·{" "}
                      {division
                        ? `${division.league_name} ${division.tier_name}`
                        : "No division"}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/15 bg-surface-2/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/70">
                    {comp.status.replace(/_/g, " ")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
