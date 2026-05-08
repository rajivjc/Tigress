import { redirect } from "next/navigation";
import { getCurrentStaff, listAllStaff } from "@/lib/data/staff";
import {
  listMyOutgoingRequests,
  listOpenGiveaways,
  listRecentlyAccepted,
} from "@/scheduling/data/shift-change-requests";
import { getShift } from "@/scheduling/data/weeks";
import { addDaysSGT, todaySGT } from "@/lib/timezone";
import { ManagerSwapsClient } from "@/components/scheduling/ManagerSwapsClient";
import type { ScheduleShift, ShiftChangeRequest } from "@/scheduling/types";

export const dynamic = "force-dynamic";

export default async function ManagerSwapsPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "manager" && current.role !== "owner") {
    redirect("/staff/schedule");
  }

  const since = `${addDaysSGT(todaySGT(), -7)}T00:00:00Z`;
  const [accepted, giveaways, allStaff] = await Promise.all([
    listRecentlyAccepted(since),
    listOpenGiveaways(),
    listAllStaff(),
  ]);

  // Pending outgoing — anyone's. We use the per-user listing in a loop
  // because we don't have a "list all pending" helper and the volume is
  // tiny in practice.
  const pendingByUser = await Promise.all(
    allStaff.map((s) => listMyOutgoingRequests(s.id))
  );
  const pending = pendingByUser
    .flat()
    .filter((r) => r.status === "pending") as ShiftChangeRequest[];

  const shiftIds = new Set<string>();
  for (const r of accepted) shiftIds.add(r.shift_id);
  for (const r of giveaways) shiftIds.add(r.shift_id);
  for (const r of pending) shiftIds.add(r.shift_id);
  const shifts: ScheduleShift[] = [];
  for (const sid of shiftIds) {
    const s = await getShift(sid);
    if (s) shifts.push(s);
  }

  return (
    <ManagerSwapsClient
      pending={pending}
      accepted={accepted}
      giveaways={giveaways}
      shifts={shifts}
      allStaff={allStaff}
    />
  );
}
