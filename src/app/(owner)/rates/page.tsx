import { redirect } from "next/navigation";
import { RateCardEditor } from "@/components/owner/RateCardEditor";
import { getAllRateCardEntries } from "@/lib/data/settings";
import { getCurrentStaff } from "@/lib/data/staff";

export const dynamic = "force-dynamic";

export default async function RatesPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "owner") redirect("/floor");

  const rates = await getAllRateCardEntries();

  return (
    <div className="space-y-6 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Owner
        </p>
        <h1 className="text-xl font-bold text-white">Rate card</h1>
        <p className="mt-1 text-xs text-white/50">
          Display rates shown on the public menu. Informational only — they
          are not used for billing.
        </p>
      </header>

      <RateCardEditor rates={rates} />
    </div>
  );
}
