import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDayView } from "@/components/calendar/CalendarDayView";
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";
import { getCalendarDay, getCalendarWeek } from "@/lib/data/calendar";
import { getCurrentStaff } from "@/lib/data/staff";
import { todaySGT } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type CalendarView = "day" | "week";

interface StaffCalendarPageProps {
  searchParams: { date?: string; view?: string };
}

export default async function StaffCalendarPage({
  searchParams,
}: StaffCalendarPageProps) {
  const current = await getCurrentStaff();
  if (!current) {
    redirect("/login");
  }

  const date = isValidDateString(searchParams.date)
    ? searchParams.date!
    : todaySGT();

  const view: CalendarView = searchParams.view === "week" ? "week" : "day";

  const tabs = (
    <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
      <Link
        href={`/calendar?date=${date}&view=day`}
        className={`flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium transition-colors ${
          view === "day"
            ? "bg-accent/20 text-white"
            : "text-white/60 hover:bg-white/5"
        }`}
      >
        Day
      </Link>
      <Link
        href={`/calendar?date=${date}&view=week`}
        className={`flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium transition-colors ${
          view === "week"
            ? "bg-accent/20 text-white"
            : "text-white/60 hover:bg-white/5"
        }`}
      >
        Week
      </Link>
    </div>
  );

  if (view === "week") {
    const week = await getCalendarWeek(date);
    return (
      <div className="space-y-4 p-4">
        <header>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Week summary
          </p>
          <h1 className="text-xl font-bold text-white">Calendar</h1>
        </header>
        {tabs}
        <CalendarWeekView week={week} />
      </div>
    );
  }

  const day = await getCalendarDay(date);
  return (
    <>
      <div className="px-4 pt-4">{tabs}</div>
      <CalendarDayView day={day} />
    </>
  );
}

function isValidDateString(s: string | undefined): s is string {
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
