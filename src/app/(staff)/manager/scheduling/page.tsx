import { redirect } from "next/navigation";
import { getCurrentStaff, listAllStaff } from "@/lib/data/staff";
import { listWeeks, listShiftsForWeek } from "@/scheduling/data/weeks";
import {
  listDayCoverage,
  listShiftTemplates,
} from "@/scheduling/data/templates";
import { listAllQualifications } from "@/scheduling/data/qualifications";
import { listFtAssignments } from "@/scheduling/data/ft-assignments";
import { getAvailabilityForWeek } from "@/scheduling/data/availability";
import { weekStartFor, addDaysIso } from "@/scheduling/lib/materialize";
import { todaySGT } from "@/lib/timezone";
import { ManagerSchedulingClient } from "@/components/scheduling/ManagerSchedulingClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { week?: string };
}

export default async function ManagerSchedulingPage({
  searchParams,
}: PageProps) {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "manager" && current.role !== "owner") {
    redirect("/staff/schedule");
  }

  const weekStartDate = weekStartFor(searchParams.week ?? todaySGT());

  const [weeks, templates, dayCoverage, staff, qualifications, ftAssignments] =
    await Promise.all([
      listWeeks(),
      listShiftTemplates(),
      listDayCoverage(),
      listAllStaff(),
      listAllQualifications(),
      listFtAssignments(),
    ]);

  let week = weeks.find((w) => w.week_start_date === weekStartDate) ?? null;
  // Show shifts only when a week exists; otherwise the page shows a "Create"
  // button.
  const shifts = week ? await listShiftsForWeek(week.id) : [];
  const availability = await getAvailabilityForWeek(weekStartDate);

  const previousWeekExists = weeks.some(
    (w) => w.week_start_date === addDaysIso(weekStartDate, -7)
  );

  return (
    <ManagerSchedulingClient
      week={week}
      weekStartDate={weekStartDate}
      shifts={shifts}
      templates={templates}
      dayCoverage={dayCoverage}
      staff={staff}
      qualifications={qualifications}
      ftAssignments={ftAssignments}
      availability={availability}
      previousWeek={addDaysIso(weekStartDate, -7)}
      nextWeek={addDaysIso(weekStartDate, 7)}
      previousWeekExists={previousWeekExists}
    />
  );
}
