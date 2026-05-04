import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/data/staff";
import { listSeasons } from "@/competitions/data/seasons";
import { SeasonsAdmin } from "@/competitions/components/SeasonsAdmin";

export const dynamic = "force-dynamic";

export default async function SeasonsAdminPage() {
  const staff = await getCurrentStaff();
  if (staff?.role !== "owner") redirect("/leagues");

  const seasons = await listSeasons();
  return (
    <div className="space-y-6 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">Owner</p>
        <h1 className="text-xl font-bold text-white">Seasons</h1>
        <p className="mt-1 text-xs text-white/50">
          Create and manage league seasons.
        </p>
      </header>
      <SeasonsAdmin seasons={seasons} />
    </div>
  );
}
