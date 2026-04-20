import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentStaff } from "@/lib/data/staff";
import { getCompetition } from "@/competitions/data/competitions";
import { listEntrantsEnriched } from "@/competitions/data/entrants";
import { listMatches } from "@/competitions/data/matches";
import { listGameTypes } from "@/competitions/data/game-types";
import { CompetitionDetail } from "@/competitions/components/CompetitionDetail";

export const dynamic = "force-dynamic";

export default async function CompetitionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "owner") redirect("/floor");

  const competition = await getCompetition(params.id);
  if (!competition) notFound();

  const [entrants, matches, gameTypes] = await Promise.all([
    listEntrantsEnriched(params.id),
    listMatches({ competitionId: params.id }),
    listGameTypes(),
  ]);

  return (
    <div className="space-y-6 p-4">
      <header>
        <Link
          href="/competitions"
          className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Competitions
        </Link>
      </header>

      <CompetitionDetail
        competition={competition}
        entrants={entrants}
        matches={matches}
        gameTypes={gameTypes}
      />
    </div>
  );
}
