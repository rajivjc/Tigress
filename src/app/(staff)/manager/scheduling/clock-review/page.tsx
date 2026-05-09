import { redirect } from "next/navigation";
import { getCurrentStaff, listAllStaff } from "@/lib/data/staff";
import { listClockRecordsForShifts } from "@/scheduling/data/clock-records";
import { listAttendanceForShifts } from "@/scheduling/data/attendance";
import { listPendingCorrections } from "@/scheduling/data/clock-corrections";
import {
  listShiftTemplates,
} from "@/scheduling/data/templates";
import { listWeeks, listShiftsForWeek } from "@/scheduling/data/weeks";
import { todaySGT } from "@/lib/timezone";
import { weekStartFor } from "@/scheduling/lib/materialize";
import { ManagerClockReviewClient } from "@/components/scheduling/ManagerClockReviewClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { date?: string };
}

export default async function ClockReviewPage({ searchParams }: PageProps) {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "manager" && current.role !== "owner") {
    redirect("/staff/schedule");
  }

  const date = searchParams.date ?? todaySGT();
  const weekStart = weekStartFor(date);

  const weeks = await listWeeks();
  const week = weeks.find((w) => w.week_start_date === weekStart);
  const allShifts = week ? await listShiftsForWeek(week.id) : [];
  const dayShifts = allShifts.filter((s) => s.shift_date === date);

  const [records, attendance, templates, allStaff, corrections] =
    await Promise.all([
      listClockRecordsForShifts(dayShifts.map((s) => s.id)),
      listAttendanceForShifts(dayShifts.map((s) => s.id)),
      listShiftTemplates(),
      listAllStaff(),
      listPendingCorrections(),
    ]);

  return (
    <ManagerClockReviewClient
      date={date}
      shifts={dayShifts}
      records={records}
      attendance={attendance}
      templates={templates}
      allStaff={allStaff}
      pendingCorrections={corrections}
    />
  );
}
