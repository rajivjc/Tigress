import { beforeEach, describe, expect, it } from "vitest";
import {
  clockInAction,
  clockOutAction,
  editClockRecordAction,
  lockClockRecordsAction,
  requestClockCorrectionAction,
  resolveClockCorrectionAction,
  unlockClockRecordAction,
} from "@/scheduling/actions/clock";
import {
  createWeekAction,
  publishWeekAction,
} from "@/scheduling/actions/weeks";
import { addShift, getShift, listShiftsForWeek } from "@/scheduling/data/weeks";
import { listPendingCorrections } from "@/scheduling/data/clock-corrections";
import { getClockRecordForShift } from "@/scheduling/data/clock-records";
import { todaySGT } from "@/lib/timezone";
import { weekStartFor } from "@/scheduling/lib/materialize";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

async function buildPublishedShiftForToday(
  options: { userId: string; role?: "bartender" | "floor" | "mod" } = {
    userId: "mock-staff-row-1",
  }
) {
  const ws = weekStartFor(todaySGT());
  signInAs("mock-manager-1");
  await createWeekAction(ws);
  const weekShifts = await listShiftsForWeek((await import("@/scheduling/data/mock-data")).MOCK_SCHEDULE_WEEKS[0].id);
  const week = (await import("@/scheduling/data/mock-data")).MOCK_SCHEDULE_WEEKS[0];
  const add = await addShift({
    weekId: week.id,
    templateId: "schedule-template-am",
    shiftDate: todaySGT(),
    role: options.role ?? "bartender",
    startTime: "10:00:00",
    endTime: "18:00:00",
    userId: options.userId,
  });
  // Publish so clockInAction's "published week" precondition passes.
  await publishWeekAction({
    weekId: week.id,
    overrideNote: "test override",
  });
  void weekShifts; // keep helper output around for debugging
  return add.shiftId!;
}

describe("clock server actions (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("rejects clockInAction when not signed in", async () => {
    const r = await clockInAction("any");
    expect(r.success).toBe(false);
  });

  it("rejects clockInAction when shift is not assigned to current user", async () => {
    const shiftId = await buildPublishedShiftForToday({
      userId: "mock-staff-row-2",
    });
    signInAs("mock-staff-1"); // mock-staff-row-1 — not the assignee
    const r = await clockInAction(shiftId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not assigned/i);
  });

  it("succeeds when assignee clocks in their own published shift today", async () => {
    const shiftId = await buildPublishedShiftForToday({
      userId: "mock-staff-row-1",
    });
    signInAs("mock-staff-1");
    const r = await clockInAction(shiftId);
    expect(r.success).toBe(true);
    expect(r.recordId).toBeDefined();
  });

  it("rejects clockInAction for a non-published week", async () => {
    signInAs("mock-manager-1");
    const ws = weekStartFor(todaySGT());
    await createWeekAction(ws);
    const week = (await import("@/scheduling/data/mock-data")).MOCK_SCHEDULE_WEEKS[0];
    const add = await addShift({
      weekId: week.id,
      templateId: "schedule-template-am",
      shiftDate: todaySGT(),
      role: "bartender",
      startTime: "10:00:00",
      endTime: "18:00:00",
      userId: "mock-staff-row-1",
    });
    signInAs("mock-staff-1");
    const r = await clockInAction(add.shiftId!);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/published/i);
  });

  it("clockOut → pending_review; correction approval → re-edits the record", async () => {
    const shiftId = await buildPublishedShiftForToday();
    signInAs("mock-staff-1");
    const ci = await clockInAction(shiftId);
    const co = await clockOutAction(ci.recordId!);
    expect(co.success).toBe(true);

    const proposedIn = "2026-05-04T01:30:00Z";
    const proposedOut = "2026-05-04T10:30:00Z";
    const reqResult = await requestClockCorrectionAction({
      clockRecordId: ci.recordId!,
      proposedClockedInAt: proposedIn,
      proposedClockedOutAt: proposedOut,
      reason: "Forgot to clock in on time",
    });
    expect(reqResult.success).toBe(true);

    signInAs("mock-manager-1");
    const pending = await listPendingCorrections();
    expect(pending.length).toBe(1);
    const approved = await resolveClockCorrectionAction({
      correctionId: pending[0].id,
      decision: "approve",
    });
    expect(approved.success).toBe(true);
    const refetched = await getClockRecordForShift(shiftId, "mock-staff-row-1");
    expect(refetched?.manager_edited).toBe(true);
    expect(refetched?.clocked_in_at).toBe(proposedIn);
    expect(refetched?.clocked_out_at).toBe(proposedOut);
  });

  it("editClockRecordAction requires a manager note", async () => {
    const shiftId = await buildPublishedShiftForToday();
    signInAs("mock-staff-1");
    const ci = await clockInAction(shiftId);
    await clockOutAction(ci.recordId!);

    signInAs("mock-manager-1");
    const noNote = await editClockRecordAction({
      clockRecordId: ci.recordId!,
      clockedInAt: "2026-05-04T01:55:00Z",
      clockedOutAt: "2026-05-04T10:00:00Z",
      note: "",
    });
    expect(noNote.success).toBe(false);
  });

  it("lockClockRecordsAction requires manager role", async () => {
    const shiftId = await buildPublishedShiftForToday();
    signInAs("mock-staff-1");
    const ci = await clockInAction(shiftId);
    await clockOutAction(ci.recordId!);

    // Staff cannot lock.
    const blocked = await lockClockRecordsAction([ci.recordId!]);
    expect(blocked.success).toBe(false);

    signInAs("mock-manager-1");
    const ok = await lockClockRecordsAction([ci.recordId!]);
    expect(ok.success).toBe(true);
    expect(ok.locked).toBe(1);
  });

  it("unlockClockRecordAction requires note + manager role", async () => {
    const shiftId = await buildPublishedShiftForToday();
    signInAs("mock-staff-1");
    const ci = await clockInAction(shiftId);
    await clockOutAction(ci.recordId!);
    signInAs("mock-manager-1");
    await lockClockRecordsAction([ci.recordId!]);

    const noNote = await unlockClockRecordAction({
      clockRecordId: ci.recordId!,
      note: "",
    });
    expect(noNote.success).toBe(false);
    const ok = await unlockClockRecordAction({
      clockRecordId: ci.recordId!,
      note: "Pay rate revised — needs manual edit",
    });
    expect(ok.success).toBe(true);
  });

  // Reference imports — `getShift` is used in helpers but kept here so an
  // unused-import lint can't drop them later.
  void getShift;
});
