import { redirect } from "next/navigation";
import { CalendarDayView } from "@/components/calendar/CalendarDayView";
import { getCalendarDay } from "@/lib/data/calendar";
import { getCurrentStaff } from "@/lib/data/staff";
import { todaySGT } from "@/lib/timezone";

export const dynamic = "force-dynamic";

interface StaffCalendarPageProps {
  searchParams: { date?: string };
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

  const day = await getCalendarDay(date);

  return <CalendarDayView day={day} />;
}

function isValidDateString(s: string | undefined): s is string {
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
