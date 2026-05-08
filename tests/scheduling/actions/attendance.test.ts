import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAttendanceFlagAction,
  markExcusedAction,
  markNoShowAction,
} from "@/scheduling/actions/attendance";
import { addShift } from "@/scheduling/data/weeks";
import { getAttendance } from "@/scheduling/data/attendance";
import {
  createWeekAction,
  publishWeekAction,
} from "@/scheduling/actions/weeks";
import { weekStartFor } from "@/scheduling/lib/materialize";
import { todaySGT } from "@/lib/timezone";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

describe("attendance server actions (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  async function makeShift() {
    const ws = weekStartFor(todaySGT());
    signInAs("mock-manager-1");
    await createWeekAction(ws);
    const week = (await import("@/scheduling/data/mock-data")).MOCK_SCHEDULE_WEEKS[0];
    const add = await addShift({
      weekId: week.id,
      templateId: "schedule-template-pm",
      shiftDate: todaySGT(),
      role: "bartender",
      startTime: "17:00:00",
      endTime: "23:00:00",
      userId: "mock-staff-row-1",
    });
    await publishWeekAction({ weekId: week.id, overrideNote: "test" });
    return add.shiftId!;
  }

  it("staff cannot mark no-show", async () => {
    const shiftId = await makeShift();
    signInAs("mock-staff-1");
    const r = await markNoShowAction({ shiftId });
    expect(r.success).toBe(false);
  });

  it("manager marks no-show, attendance row created with status no_show", async () => {
    const shiftId = await makeShift();
    signInAs("mock-manager-1");
    const r = await markNoShowAction({ shiftId, note: "Did not show up" });
    expect(r.success).toBe(true);
    const row = await getAttendance(shiftId);
    expect(row?.attendance_status).toBe("no_show");
  });

  it("markExcusedAction requires a note", async () => {
    const shiftId = await makeShift();
    signInAs("mock-manager-1");
    const noNote = await markExcusedAction({ shiftId, note: "" });
    expect(noNote.success).toBe(false);
    const ok = await markExcusedAction({
      shiftId,
      note: "Sick — doctor's note",
    });
    expect(ok.success).toBe(true);
    const row = await getAttendance(shiftId);
    expect(row?.attendance_status).toBe("excused");
  });

  it("clearAttendanceFlagAction removes the row", async () => {
    const shiftId = await makeShift();
    signInAs("mock-manager-1");
    await markNoShowAction({ shiftId });
    await clearAttendanceFlagAction(shiftId);
    const row = await getAttendance(shiftId);
    expect(row).toBeNull();
  });
});
