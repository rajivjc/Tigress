import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/data/staff";
import { listShiftsForUserInDateRange } from "@/scheduling/data/weeks";
import { listClockRecordsForShifts } from "@/scheduling/data/clock-records";
import { listCorrectionsForRecord } from "@/scheduling/data/clock-corrections";
import { listShiftTemplates } from "@/scheduling/data/templates";
import { addDaysSGT, todaySGT } from "@/lib/timezone";
import { StaffClockClient } from "@/components/scheduling/StaffClockClient";
import type { ClockCorrection } from "@/scheduling/types";

export const dynamic = "force-dynamic";

export default async function StaffClockPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");

  const today = todaySGT();
  const start = addDaysSGT(today, -14);

  const [shifts, templates] = await Promise.all([
    listShiftsForUserInDateRange(current.staff.id, start, today),
    listShiftTemplates(),
  ]);

  const records = await listClockRecordsForShifts(shifts.map((s) => s.id));
  const correctionLists = await Promise.all(
    records.map((r) => listCorrectionsForRecord(r.id))
  );
  const correctionsByRecord = new Map<string, ClockCorrection[]>();
  records.forEach((r, i) => correctionsByRecord.set(r.id, correctionLists[i]));

  return (
    <StaffClockClient
      currentUserId={current.staff.id}
      today={today}
      shifts={shifts}
      templates={templates}
      records={records}
      correctionsByRecord={Object.fromEntries(correctionsByRecord)}
    />
  );
}
