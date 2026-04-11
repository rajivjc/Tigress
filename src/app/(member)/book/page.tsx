import { redirect } from "next/navigation";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { getCurrentAuthUserId, getMemberWithTier } from "@/lib/data/members";
import { getTablesWithStatus } from "@/lib/data/tables";
import { addDaysSGT, todaySGT } from "@/lib/timezone";

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

  // Compute today + the maximum bookable date in Singapore time so the
  // initial state is deterministic across SSR/hydration regardless of which
  // timezone the server happens to be in.
  const priorityDays = profile.tier?.priority_booking_days ?? 3;
  const today = todaySGT();
  const maxDate = addDaysSGT(today, priorityDays);

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
