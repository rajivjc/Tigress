import { redirect } from "next/navigation";
import { TierEditor } from "@/components/owner/TierEditor";
import { getAllTiers } from "@/lib/data/members";
import { getCurrentStaff } from "@/lib/data/staff";
import {
  VENUE_CLOSE_HOUR,
  VENUE_OPEN_HOUR,
  SLOT_STEP_MINUTES,
} from "@/lib/data/tables";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "owner") redirect("/floor");

  const tiers = await getAllTiers();

  return (
    <div className="space-y-6 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Owner
        </p>
        <h1 className="text-xl font-bold text-white">Venue settings</h1>
        <p className="mt-1 text-xs text-white/50">
          Configure membership tiers and review booking rules.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/60">
          Membership tiers
        </h2>
        <TierEditor tiers={tiers} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/60">
          Booking rules
        </h2>
        <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
          <Rule
            label="Venue opens"
            value={`${String(VENUE_OPEN_HOUR).padStart(2, "0")}:00`}
          />
          <Rule
            label="Venue closes"
            value={`${String(VENUE_CLOSE_HOUR % 24).padStart(2, "0")}:00`}
          />
          <Rule label="Slot granularity" value={`${SLOT_STEP_MINUTES} min`} />
          <Rule label="Max session length" value="3 hours" />
          <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-white/40">
            These are currently compile-time constants. Contact the developer
            to change them — a future settings table will make them editable
            here.
          </p>
        </div>
      </section>
    </div>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/50">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}
