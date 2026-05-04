import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/data/staff";
import { listDivisions } from "@/competitions/data/divisions";
import { listSeasons } from "@/competitions/data/seasons";
import { DivisionsAdmin } from "@/competitions/components/DivisionsAdmin";

export const dynamic = "force-dynamic";

export default async function DivisionsAdminPage() {
  const staff = await getCurrentStaff();
  if (staff?.role !== "owner") redirect("/leagues");

  const [seasons, divisions] = await Promise.all([
    listSeasons(),
    listDivisions(),
  ]);
  return (
    <div className="space-y-6 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">Owner</p>
        <h1 className="text-xl font-bold text-white">Divisions</h1>
        <p className="mt-1 text-xs text-white/50">
          Create and archive divisions within seasons.
        </p>
      </header>
      <DivisionsAdmin seasons={seasons} divisions={divisions} />
    </div>
  );
}
