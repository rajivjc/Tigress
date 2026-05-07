import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/data/staff";
import { getAvailabilityForUser } from "@/scheduling/data/availability";
import { weekStartFor, addDaysIso } from "@/scheduling/lib/materialize";
import { todaySGT } from "@/lib/timezone";
import { AvailabilityClient } from "@/components/scheduling/AvailabilityClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { week?: string };
}

export default async function AvailabilityPage({ searchParams }: PageProps) {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");

  const today = todaySGT();
  const currentWeek = weekStartFor(searchParams.week ?? today);
  const nextWeek = addDaysIso(currentWeek, 7);

  const [thisWeekBlocks, nextWeekBlocks] = await Promise.all([
    getAvailabilityForUser(current.staff.id, currentWeek),
    getAvailabilityForUser(current.staff.id, nextWeek),
  ]);

  return (
    <AvailabilityClient
      currentWeek={currentWeek}
      nextWeek={nextWeek}
      thisWeekBlocks={thisWeekBlocks}
      nextWeekBlocks={nextWeekBlocks}
      employmentType={current.staff.employment_type}
    />
  );
}
