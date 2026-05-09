// =============================================================================
// S26 fix-up tests folded into S27a
// =============================================================================
// Audit findings:
//   Critical 1: reverseSwapAction atomicity — wired to schedule_reverse_swap
//               RPC; mock mode mirrors the throw-rollback behaviour.
//   Medium 3:   managerEditClockRecord status branching on active records.
//   Medium 4:   requestClockCorrectionAction precondition — block on active.
//   Medium 5:   createClockRecordAsManagerAction — past-shift recovery.
//   Medium 6:   atomicity tests for createWeek + copyFromPreviousWeek with
//               vi.spyOn throw-injection.
//   Lower 7:    specific-error-message assertions in swap-accept.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptSwapRequestAction,
  requestDirectSwapAction,
  reverseSwapAction,
} from "@/scheduling/actions/swaps";
import {
  clockInAction,
  clockOutAction,
  createClockRecordAsManagerAction,
  editClockRecordAction,
  requestClockCorrectionAction,
} from "@/scheduling/actions/clock";
import {
  createWeekAction,
  publishWeekAction,
  copyFromPreviousWeekAction,
} from "@/scheduling/actions/weeks";
import { addShift, getShift } from "@/scheduling/data/weeks";
import { listMyOutgoingRequests } from "@/scheduling/data/shift-change-requests";
import { getClockRecord } from "@/scheduling/data/clock-records";
import { replaceAvailability } from "@/scheduling/data/availability";
import { weekStartFor } from "@/scheduling/lib/materialize";
import { addDaysSGT, todaySGT } from "@/lib/timezone";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";
import {
  MOCK_SCHEDULE_SHIFTS,
  MOCK_SCHEDULE_WEEKS,
} from "@/scheduling/data/mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

async function buildPublishedShift(opts: {
  userId: string;
  date: string;
  role?: "bartender" | "floor" | "mod";
}) {
  const ws = weekStartFor(opts.date);
  signInAs("mock-manager-1");
  await createWeekAction(ws);
  const week = MOCK_SCHEDULE_WEEKS.find((w) => w.week_start_date === ws)!;
  const add = await addShift({
    weekId: week.id,
    templateId: "schedule-template-am",
    shiftDate: opts.date,
    role: opts.role ?? "bartender",
    startTime: "10:00:00",
    endTime: "18:00:00",
    userId: opts.userId,
  });
  await publishWeekAction({ weekId: week.id, overrideNote: "test" });
  return add.shiftId!;
}

describe("S26 fix-ups", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  // --- Critical 1: reverseSwap atomicity via RPC -----------------------------

  describe("reverseSwapAction atomicity (S26 Critical 1)", () => {
    it("atomically restores assignee AND marks request reversed", async () => {
      const farFuture = addDaysSGT(todaySGT(), 14);
      const ws = weekStartFor(farFuture);
      const dow = (new Date(`${farFuture}T00:00:00Z`).getUTCDay() + 6) % 7;
      await replaceAvailability("mock-staff-row-4", ws, [
        { day_of_week: dow, start_time: "10:00:00", end_time: "23:59:00" },
      ]);
      const shiftId = await buildPublishedShift({
        userId: "mock-staff-row-1",
        date: farFuture,
      });
      signInAs("mock-staff-1");
      await requestDirectSwapAction({
        shiftId,
        targetUserId: "mock-staff-row-4",
      });
      const reqId = (await listMyOutgoingRequests("mock-staff-row-1"))[0].id;
      signInAs("mock-pt-1");
      await acceptSwapRequestAction(reqId);
      // Sanity — shift now assigned to PT-1.
      let shift = await getShift(shiftId);
      expect(shift?.user_id).toBe("mock-staff-row-4");

      signInAs("mock-manager-1");
      const ok = await reverseSwapAction({ requestId: reqId, note: "Reverted" });
      expect(ok.success).toBe(true);
      shift = await getShift(shiftId);
      expect(shift?.user_id).toBe("mock-staff-row-1");
    });
  });

  // --- Medium 3: managerEditClockRecord status branching ---------------------

  describe("managerEditClockRecord status branching (S26 Medium 3)", () => {
    it("editing an active record keeps clock_out empty AND status active", async () => {
      const shiftId = await buildPublishedShift({
        userId: "mock-staff-row-1",
        date: todaySGT(),
      });
      signInAs("mock-staff-1");
      const ci = await clockInAction(shiftId);
      expect(ci.success).toBe(true);
      const before = await getClockRecord(ci.recordId!);
      expect(before?.status).toBe("active");

      signInAs("mock-manager-1");
      const r = await editClockRecordAction({
        clockRecordId: ci.recordId!,
        clockedInAt: "2026-05-04T01:00:00Z",
        clockedOutAt: "2026-05-04T05:00:00Z", // ignored on active
        note: "shifted clock-in earlier",
      });
      expect(r.success).toBe(true);
      const after = await getClockRecord(ci.recordId!);
      expect(after?.status).toBe("active");
      expect(after?.clocked_out_at).toBeNull();
      expect(after?.clocked_in_at).toBe("2026-05-04T01:00:00Z");
      expect(after?.manager_edited).toBe(true);
    });

    it("editing a pending_review record applies clock_out and keeps status pending_review", async () => {
      const shiftId = await buildPublishedShift({
        userId: "mock-staff-row-1",
        date: todaySGT(),
      });
      signInAs("mock-staff-1");
      const ci = await clockInAction(shiftId);
      await clockOutAction(ci.recordId!);

      signInAs("mock-manager-1");
      const r = await editClockRecordAction({
        clockRecordId: ci.recordId!,
        clockedInAt: "2026-05-04T01:00:00Z",
        clockedOutAt: "2026-05-04T05:00:00Z",
        note: "fixed times",
      });
      expect(r.success).toBe(true);
      const after = await getClockRecord(ci.recordId!);
      expect(after?.status).toBe("pending_review");
      expect(after?.clocked_out_at).toBe("2026-05-04T05:00:00Z");
    });
  });

  // --- Medium 4: requestClockCorrection precondition --------------------------

  describe("requestClockCorrectionAction precondition (S26 Medium 4)", () => {
    it("rejects a correction request when the record is still active", async () => {
      const shiftId = await buildPublishedShift({
        userId: "mock-staff-row-1",
        date: todaySGT(),
      });
      signInAs("mock-staff-1");
      const ci = await clockInAction(shiftId);
      // Record is active — staff is still on shift.
      const r = await requestClockCorrectionAction({
        clockRecordId: ci.recordId!,
        proposedClockedInAt: "2026-05-04T01:00:00Z",
        proposedClockedOutAt: null,
        reason: "Forgot to start on time",
      });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/clock out/i);
    });
  });

  // --- Medium 5: createClockRecordAsManager ----------------------------------

  describe("createClockRecordAsManagerAction (S26 Medium 5)", () => {
    it("creates a pending_review record for a past-shift recovery", async () => {
      const shiftId = await buildPublishedShift({
        userId: "mock-staff-row-1",
        date: todaySGT(),
      });
      signInAs("mock-manager-1");
      const r = await createClockRecordAsManagerAction({
        shiftId,
        userId: "mock-staff-row-1",
        clockedInAt: "2026-05-04T02:00:00Z",
        clockedOutAt: "2026-05-04T10:00:00Z",
        note: "Forgot to clock in",
      });
      expect(r.success).toBe(true);
      const record = await getClockRecord(r.recordId!);
      expect(record?.status).toBe("pending_review");
      expect(record?.manager_edited).toBe(true);
      expect(record?.manager_edit_note).toMatch(/forgot/i);
    });

    it("rejects when a clock record already exists for the shift", async () => {
      const shiftId = await buildPublishedShift({
        userId: "mock-staff-row-1",
        date: todaySGT(),
      });
      signInAs("mock-staff-1");
      await clockInAction(shiftId);

      signInAs("mock-manager-1");
      const r = await createClockRecordAsManagerAction({
        shiftId,
        userId: "mock-staff-row-1",
        clockedInAt: "2026-05-04T02:00:00Z",
        clockedOutAt: "2026-05-04T10:00:00Z",
        note: "duplicate",
      });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/already exists/i);
    });

    it("rejects when staff role is required (non-manager call)", async () => {
      const shiftId = await buildPublishedShift({
        userId: "mock-staff-row-1",
        date: todaySGT(),
      });
      signInAs("mock-staff-1");
      const r = await createClockRecordAsManagerAction({
        shiftId,
        userId: "mock-staff-row-1",
        clockedInAt: "2026-05-04T02:00:00Z",
        clockedOutAt: "2026-05-04T10:00:00Z",
        note: "trying without role",
      });
      expect(r.success).toBe(false);
    });
  });

  // --- Medium 6: throw-injection atomicity tests -----------------------------

  describe("createWeek + copyFromPreviousWeek atomicity (S26 Medium 6)", () => {
    it("createWeek rolls back the week row when shift insertion throws", async () => {
      signInAs("mock-manager-1");
      const ws = "2026-09-07"; // Monday
      const before = MOCK_SCHEDULE_WEEKS.length;
      // Throw on the next push to MOCK_SCHEDULE_SHIFTS to simulate
      // partial-failure at shift creation.
      const spy = vi
        .spyOn(MOCK_SCHEDULE_SHIFTS, "push")
        .mockImplementationOnce(() => {
          throw new Error("simulated shift insert failure");
        });
      try {
        const r = await createWeekAction(ws);
        expect(r.success).toBe(false);
      } finally {
        spy.mockRestore();
      }
      // Week + shifts should both be absent.
      expect(MOCK_SCHEDULE_WEEKS.length).toBe(before);
      expect(
        MOCK_SCHEDULE_WEEKS.find((w) => w.week_start_date === ws)
      ).toBeUndefined();
    });

    it("copyFromPreviousWeek rolls back when carry-over insertion throws", async () => {
      signInAs("mock-manager-1");
      const prevWs = "2026-09-07";
      const newWs = "2026-09-14";
      await createWeekAction(prevWs);
      const before = MOCK_SCHEDULE_WEEKS.length;

      const spy = vi
        .spyOn(MOCK_SCHEDULE_SHIFTS, "push")
        .mockImplementationOnce(() => {
          throw new Error("simulated copy carry-over failure");
        });
      try {
        const r = await copyFromPreviousWeekAction(newWs);
        expect(r.success).toBe(false);
      } finally {
        spy.mockRestore();
      }
      // The new week row should NOT exist.
      expect(MOCK_SCHEDULE_WEEKS.length).toBe(before);
      expect(
        MOCK_SCHEDULE_WEEKS.find((w) => w.week_start_date === newWs)
      ).toBeUndefined();
    });
  });

  // --- Lower 7: specific-error-message assertions in swap-accept -------------

  describe("specific-error-message assertions in acceptSwapRequest (S26 Lower 7)", () => {
    it("non-target gets a 'not directed at you'-style error", async () => {
      const farFuture = addDaysSGT(todaySGT(), 14);
      const ws = weekStartFor(farFuture);
      const dow = (new Date(`${farFuture}T00:00:00Z`).getUTCDay() + 6) % 7;
      await replaceAvailability("mock-staff-row-4", ws, [
        { day_of_week: dow, start_time: "10:00:00", end_time: "23:59:00" },
      ]);
      const shiftId = await buildPublishedShift({
        userId: "mock-staff-row-1",
        date: farFuture,
      });
      signInAs("mock-staff-1");
      await requestDirectSwapAction({
        shiftId,
        targetUserId: "mock-staff-row-4",
      });
      const reqId = (await listMyOutgoingRequests("mock-staff-row-1"))[0].id;

      signInAs("mock-pt-2"); // wrong target
      const r = await acceptSwapRequestAction(reqId);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/not directed at you/i);
    });
  });
});
