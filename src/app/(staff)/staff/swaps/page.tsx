import { redirect } from "next/navigation";
import { getCurrentStaff, listAllStaff } from "@/lib/data/staff";
import {
  listIncomingDirectSwaps,
  listMyOutgoingRequests,
  listOpenGiveaways,
} from "@/scheduling/data/shift-change-requests";
import {
  listShiftsForUserInDateRange,
  listShiftsForWeek,
  listWeeks,
  getShift,
} from "@/scheduling/data/weeks";
import { listShiftTemplates } from "@/scheduling/data/templates";
import { listAllQualifications } from "@/scheduling/data/qualifications";
import { addDaysSGT, todaySGT } from "@/lib/timezone";
import { StaffSwapsClient } from "@/components/scheduling/StaffSwapsClient";
import type { ScheduleShift } from "@/scheduling/types";

export const dynamic = "force-dynamic";

export default async function StaffSwapsPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");

  const today = todaySGT();
  const future = addDaysSGT(today, 28);

  const [outgoing, incoming, giveaways, myShifts, templates, allStaff, allQuals, weeks] =
    await Promise.all([
      listMyOutgoingRequests(current.staff.id),
      listIncomingDirectSwaps(current.staff.id),
      listOpenGiveaways(),
      listShiftsForUserInDateRange(current.staff.id, today, future),
      listShiftTemplates(),
      listAllStaff(),
      listAllQualifications(),
      listWeeks(),
    ]);

  // Resolve every shift referenced by any request so the UI can display
  // dates/times without an extra round trip.
  const shiftIds = new Set<string>();
  for (const r of outgoing) shiftIds.add(r.shift_id);
  for (const r of incoming) shiftIds.add(r.shift_id);
  for (const r of giveaways) shiftIds.add(r.shift_id);
  const shifts: ScheduleShift[] = [];
  for (const sid of shiftIds) {
    const s = await getShift(sid);
    if (s) shifts.push(s);
  }
  // Prefetch shift lists for all weeks the user may swap onto so the UI
  // can run the no-overlap eligibility check client-side.
  const allWeekShifts = (
    await Promise.all(weeks.map((w) => listShiftsForWeek(w.id)))
  ).flat();

  return (
    <StaffSwapsClient
      currentUserId={current.staff.id}
      outgoing={outgoing}
      incoming={incoming}
      giveaways={giveaways}
      myShifts={myShifts}
      shifts={shifts}
      templates={templates}
      allStaff={allStaff}
      qualifications={allQuals}
      allWeekShifts={allWeekShifts}
    />
  );
}
