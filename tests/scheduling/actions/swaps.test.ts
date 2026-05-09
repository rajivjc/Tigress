import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptSwapRequestAction,
  cancelSwapRequestAction,
  claimGiveawayAction,
  declineSwapRequestAction,
  requestDirectSwapAction,
  requestGiveawayAction,
  reverseSwapAction,
} from "@/scheduling/actions/swaps";
import {
  createWeekAction,
  publishWeekAction,
} from "@/scheduling/actions/weeks";
import { addShift } from "@/scheduling/data/weeks";
import {
  getChangeRequest,
  listMyOutgoingRequests,
} from "@/scheduling/data/shift-change-requests";
import { replaceAvailability } from "@/scheduling/data/availability";
import { weekStartFor } from "@/scheduling/lib/materialize";
import { addDaysSGT, todaySGT } from "@/lib/timezone";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

async function seedPtAvailability(
  userId: string,
  weekStart: string,
  dow: number
) {
  await replaceAvailability(userId, weekStart, [
    { day_of_week: dow, start_time: "10:00:00", end_time: "23:59:00" },
  ]);
}

async function buildAssignedShift(opts: {
  userId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  role?: "bartender" | "floor" | "mod";
}) {
  const ws = weekStartFor(opts.date);
  signInAs("mock-manager-1");
  await createWeekAction(ws);
  const week = (await import("@/scheduling/data/mock-data")).MOCK_SCHEDULE_WEEKS.find(
    (w) => w.week_start_date === ws
  )!;
  const add = await addShift({
    weekId: week.id,
    templateId: "schedule-template-pm",
    shiftDate: opts.date,
    role: opts.role ?? "bartender",
    startTime: opts.startTime ?? "17:00:00",
    endTime: opts.endTime ?? "23:00:00",
    userId: opts.userId,
  });
  await publishWeekAction({ weekId: week.id, overrideNote: "test" });
  return add.shiftId!;
}

describe("swap server actions (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("requester can post a giveaway and cancel it", async () => {
    const farFuture = addDaysSGT(todaySGT(), 21);
    const shiftId = await buildAssignedShift({
      userId: "mock-staff-row-1",
      date: farFuture,
    });
    signInAs("mock-staff-1");
    const r = await requestGiveawayAction({ shiftId });
    expect(r.success).toBe(true);
    const my = await listMyOutgoingRequests("mock-staff-row-1");
    expect(my.length).toBe(1);
    const cancel = await cancelSwapRequestAction(my[0].id);
    expect(cancel.success).toBe(true);
    const after = await getChangeRequest(my[0].id);
    expect(after?.status).toBe("cancelled");
  });

  it("requester cannot cancel another user's request", async () => {
    const farFuture = addDaysSGT(todaySGT(), 21);
    const shiftId = await buildAssignedShift({
      userId: "mock-staff-row-1",
      date: farFuture,
    });
    signInAs("mock-staff-1");
    const r = await requestGiveawayAction({ shiftId });
    expect(r.success).toBe(true);
    const reqId = (await listMyOutgoingRequests("mock-staff-row-1"))[0].id;
    signInAs("mock-pt-1"); // mock-staff-row-4 — different user
    const cancel = await cancelSwapRequestAction(reqId);
    expect(cancel.success).toBe(false);
  });

  it("rejects giveaway past 2-hour deadline (yesterday)", async () => {
    const yesterday = addDaysSGT(todaySGT(), -1);
    const shiftId = await buildAssignedShift({
      userId: "mock-staff-row-1",
      date: yesterday,
    });
    signInAs("mock-staff-1");
    const r = await requestGiveawayAction({ shiftId });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/deadline/i);
  });

  it("rejects direct swap when target unqualified", async () => {
    const farFuture = addDaysSGT(todaySGT(), 14);
    const shiftId = await buildAssignedShift({
      userId: "mock-staff-row-1",
      date: farFuture,
      role: "mod",
    });
    signInAs("mock-staff-1");
    // Pat (mock-staff-row-4) only has bartender — not mod.
    const r = await requestDirectSwapAction({
      shiftId,
      targetUserId: "mock-staff-row-4",
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/qualified/i);
  });

  it("non-target user cannot accept a direct swap", async () => {
    const farFuture = addDaysSGT(todaySGT(), 14);
    const ws = weekStartFor(farFuture);
    const dow = (new Date(`${farFuture}T00:00:00Z`).getUTCDay() + 6) % 7;
    await seedPtAvailability("mock-staff-row-4", ws, dow);
    const shiftId = await buildAssignedShift({
      userId: "mock-staff-row-1",
      date: farFuture,
      role: "bartender",
    });
    signInAs("mock-staff-1");
    const r = await requestDirectSwapAction({
      shiftId,
      targetUserId: "mock-staff-row-4",
    });
    expect(r.success).toBe(true);
    const reqId = (await listMyOutgoingRequests("mock-staff-row-1"))[0].id;

    // Phoebe (mock-pt-2 / mock-staff-row-5) tries to accept — not the target.
    signInAs("mock-pt-2");
    const accept = await acceptSwapRequestAction(reqId);
    expect(accept.success).toBe(false);
  });

  it("target user can accept; shift's user_id flips and pushes go out", async () => {
    const farFuture = addDaysSGT(todaySGT(), 14);
    const ws = weekStartFor(farFuture);
    const dow = (new Date(`${farFuture}T00:00:00Z`).getUTCDay() + 6) % 7;
    await seedPtAvailability("mock-staff-row-4", ws, dow);
    const shiftId = await buildAssignedShift({
      userId: "mock-staff-row-1",
      date: farFuture,
      role: "bartender",
    });
    signInAs("mock-staff-1");
    await requestDirectSwapAction({
      shiftId,
      targetUserId: "mock-staff-row-4",
    });
    const reqId = (await listMyOutgoingRequests("mock-staff-row-1"))[0].id;

    signInAs("mock-pt-1");
    const r = await acceptSwapRequestAction(reqId);
    expect(r.success).toBe(true);
    const { getShift } = await import("@/scheduling/data/weeks");
    const shift = await getShift(shiftId);
    expect(shift?.user_id).toBe("mock-staff-row-4");
  });

  it("declineSwapRequestAction works only for the target", async () => {
    const farFuture = addDaysSGT(todaySGT(), 14);
    const ws = weekStartFor(farFuture);
    const dow = (new Date(`${farFuture}T00:00:00Z`).getUTCDay() + 6) % 7;
    await seedPtAvailability("mock-staff-row-4", ws, dow);
    const shiftId = await buildAssignedShift({
      userId: "mock-staff-row-1",
      date: farFuture,
      role: "bartender",
    });
    signInAs("mock-staff-1");
    await requestDirectSwapAction({
      shiftId,
      targetUserId: "mock-staff-row-4",
    });
    const reqId = (await listMyOutgoingRequests("mock-staff-row-1"))[0].id;

    signInAs("mock-pt-2"); // wrong user
    const wrong = await declineSwapRequestAction(reqId);
    expect(wrong.success).toBe(false);

    signInAs("mock-pt-1");
    const right = await declineSwapRequestAction(reqId);
    expect(right.success).toBe(true);
  });

  it("claimGiveawayAction succeeds for a qualified, non-requester staff", async () => {
    const farFuture = addDaysSGT(todaySGT(), 14);
    const ws = weekStartFor(farFuture);
    const dow = (new Date(`${farFuture}T00:00:00Z`).getUTCDay() + 6) % 7;
    await seedPtAvailability("mock-staff-row-4", ws, dow);
    const shiftId = await buildAssignedShift({
      userId: "mock-staff-row-1",
      date: farFuture,
      role: "bartender",
    });
    signInAs("mock-staff-1");
    await requestGiveawayAction({ shiftId });
    const reqId = (await listMyOutgoingRequests("mock-staff-row-1"))[0].id;
    signInAs("mock-pt-1");
    const r = await claimGiveawayAction(reqId);
    expect(r.success).toBe(true);
  });

  it("manager reverseSwapAction restores the original assignee + records note", async () => {
    const farFuture = addDaysSGT(todaySGT(), 14);
    const ws = weekStartFor(farFuture);
    const dow = (new Date(`${farFuture}T00:00:00Z`).getUTCDay() + 6) % 7;
    await seedPtAvailability("mock-staff-row-4", ws, dow);
    const shiftId = await buildAssignedShift({
      userId: "mock-staff-row-1",
      date: farFuture,
      role: "bartender",
    });
    signInAs("mock-staff-1");
    await requestDirectSwapAction({
      shiftId,
      targetUserId: "mock-staff-row-4",
    });
    const reqId = (await listMyOutgoingRequests("mock-staff-row-1"))[0].id;
    signInAs("mock-pt-1");
    await acceptSwapRequestAction(reqId);

    signInAs("mock-staff-1"); // not a manager
    const blocked = await reverseSwapAction({
      requestId: reqId,
      note: "test",
    });
    expect(blocked.success).toBe(false);

    signInAs("mock-manager-1");
    const noNote = await reverseSwapAction({ requestId: reqId, note: "" });
    expect(noNote.success).toBe(false);

    const ok = await reverseSwapAction({
      requestId: reqId,
      note: "Original assignee can cover after all",
    });
    expect(ok.success).toBe(true);
    const { getShift } = await import("@/scheduling/data/weeks");
    const shift = await getShift(shiftId);
    expect(shift?.user_id).toBe("mock-staff-row-1");
    const refetched = await getChangeRequest(reqId);
    expect(refetched?.status).toBe("reversed");
    expect(refetched?.reversal_note).toMatch(/cover/);
  });
});
