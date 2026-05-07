import { redirect } from "next/navigation";
import { getCurrentStaff, listAllStaff } from "@/lib/data/staff";
import { listShiftsForWeek, listWeeks } from "@/scheduling/data/weeks";
import { listShiftTemplates } from "@/scheduling/data/templates";
import { weekStartFor, addDaysIso } from "@/scheduling/lib/materialize";
import { todaySGT } from "@/lib/timezone";
import { StaffScheduleClient } from "@/components/scheduling/StaffScheduleClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { week?: string };
}

export default async function StaffSchedulePage({ searchParams }: PageProps) {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");

  const weekStartDate = weekStartFor(searchParams.week ?? todaySGT());

  const [allWeeks, templates, staff] = await Promise.all([
    listWeeks(),
    listShiftTemplates(),
    listAllStaff(),
  ]);

  // Find published week for the selected start date.
  const week = allWeeks.find(
    (w) => w.week_start_date === weekStartDate && w.status === "published"
  );

  const shifts = week ? await listShiftsForWeek(week.id) : [];

  return (
    <StaffScheduleClient
      currentUserId={current.staff.id}
      weekStartDate={weekStartDate}
      week={week ?? null}
      shifts={shifts}
      templates={templates}
      staff={staff}
      canManage={current.role === "manager" || current.role === "owner"}
      todayWeekStart={weekStartFor(todaySGT())}
      previousWeek={addDaysIso(weekStartDate, -7)}
      nextWeek={addDaysIso(weekStartDate, 7)}
    />
  );
}
