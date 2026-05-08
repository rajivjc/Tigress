import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAttendance,
  getAttendance,
  setAttendance,
} from "@/scheduling/data/attendance";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("attendance data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("absence-of-row treated as expected (no row created)", async () => {
    const a = await getAttendance("s-1");
    expect(a).toBeNull();
  });

  it("setAttendance creates and updates a row", async () => {
    const r = await setAttendance({
      shiftId: "s-1",
      status: "no_show",
      markedBy: "u-mgr",
      note: null,
    });
    expect(r.success).toBe(true);
    const fetched = await getAttendance("s-1");
    expect(fetched?.attendance_status).toBe("no_show");

    const update = await setAttendance({
      shiftId: "s-1",
      status: "excused",
      markedBy: "u-mgr",
      note: "Sick — doctor's note received",
    });
    expect(update.success).toBe(true);
    const updated = await getAttendance("s-1");
    expect(updated?.attendance_status).toBe("excused");
    expect(updated?.note).toMatch(/sick/i);
  });

  it("clearAttendance removes the row", async () => {
    await setAttendance({
      shiftId: "s-1",
      status: "no_show",
      markedBy: "u-mgr",
      note: null,
    });
    await clearAttendance("s-1");
    const after = await getAttendance("s-1");
    expect(after).toBeNull();
  });
});
