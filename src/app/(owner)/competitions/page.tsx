import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Trophy } from "lucide-react";
import { getCurrentStaff } from "@/lib/data/staff";
import { listCompetitions } from "@/competitions/data/competitions";
import { listGameTypes } from "@/competitions/data/game-types";
import { CompetitionList } from "@/competitions/components/CompetitionList";

export const dynamic = "force-dynamic";

export default async function CompetitionsPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "owner") redirect("/floor");

  const [competitions, gameTypes] = await Promise.all([
    listCompetitions(),
    listGameTypes(),
  ]);
  const gameTypeMap = new Map(gameTypes.map((g) => [g.id, g]));

  return (
    <div className="space-y-6 p-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Owner
          </p>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Trophy size={20} className="text-accent" strokeWidth={1.5} />
            Competitions
          </h1>
          <p className="mt-1 text-xs text-white/50">
            Tournaments, leagues, ladders, and casual matches. Draft and
            configure competitions here — member registration and bracket
            play come online in a later session.
          </p>
        </div>
        <Link
          href="/competitions/new"
          className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          <Plus size={16} strokeWidth={2} />
          New competition
        </Link>
      </header>

      <CompetitionList competitions={competitions} gameTypes={gameTypeMap} />
    </div>
  );
}
