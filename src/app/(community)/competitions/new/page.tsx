import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentStaff } from "@/lib/data/staff";
import { listGameTypes } from "@/competitions/data/game-types";
import { CreateCompetitionForm } from "@/competitions/components/CreateCompetitionForm";

export const dynamic = "force-dynamic";

export default async function NewCompetitionPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "owner" && current.role !== "manager") {
    redirect("/competitions");
  }

  const gameTypes = await listGameTypes();

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
        <h1 className="mt-2 text-xl font-bold text-white">
          New competition (draft)
        </h1>
        <p className="mt-1 text-xs text-white/50">
          Create a draft competition. You can add entrants, open registration,
          and publish the bracket from the detail page.
        </p>
      </header>

      <CreateCompetitionForm gameTypes={gameTypes} />
    </div>
  );
}
