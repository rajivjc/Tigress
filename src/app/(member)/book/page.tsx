import { redirect } from "next/navigation";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { getCurrentAuthUserId, getMemberWithTier } from "@/lib/data/members";
import { getTablesWithStatus } from "@/lib/data/tables";

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    redirect("/login");
  }

  const profile = await getMemberWithTier(authUserId);
  if (!profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface/60 p-6 text-center">
          <h1 className="text-lg font-semibold text-white">
            No member profile
          </h1>
          <p className="mt-2 text-sm text-white/60">
            You need a member account to book a table.
          </p>
        </div>
      </div>
    );
  }

  const tables = await getTablesWithStatus();

  // Compute today + the maximum bookable date server-side so the client
  // component's initial state is deterministic across SSR/hydration.
  const priorityDays = profile.tier?.priority_booking_days ?? 3;
  const today = localDateIso(new Date());
  const maxDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + priorityDays);
    return localDateIso(d);
  })();

  return (
    <BookingFlow
      tables={tables}
      memberCreditsRemaining={profile.member.credits_remaining}
      priorityBookingDays={priorityDays}
      initialDate={today}
      minDate={today}
      maxDate={maxDate}
    />
  );
}

function localDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
