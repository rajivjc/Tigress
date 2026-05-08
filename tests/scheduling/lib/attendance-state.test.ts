import { describe, expect, it } from "vitest";
import {
  MISSING_THRESHOLD_MINUTES,
  getShiftAttendanceState,
} from "@/scheduling/lib/attendance-state";
import type { ClockRecord, ShiftAttendance } from "@/scheduling/types";

const shift = {
  shift_date: "2026-05-04",
  start_time: "10:00:00",
  end_time: "18:00:00",
};

// Singapore start of the shift in UTC ms.
const STARTS_AT_UTC_MS = Date.UTC(2026, 4, 4, 2, 0, 0);

function rec(overrides: Partial<ClockRecord>): ClockRecord {
  return {
    id: "rec-1",
    shift_id: "s-1",
    user_id: "u-1",
    clocked_in_at: "2026-05-04T02:00:00Z",
    clocked_out_at: null,
    status: "active",
    locked_at: null,
    locked_by: null,
    unlock_note: null,
    manager_edited: false,
    manager_edit_note: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function attendance(status: ShiftAttendance["attendance_status"]): ShiftAttendance {
  return {
    shift_id: "s-1",
    attendance_status: status,
    marked_by: "u-mgr",
    marked_at: "2026-05-04T03:00:00Z",
    note: null,
    updated_at: "",
  };
}

describe("getShiftAttendanceState", () => {
  it("returns excused when attendance flag = excused", () => {
    expect(
      getShiftAttendanceState({
        shift,
        now: new Date(STARTS_AT_UTC_MS),
        clockRecord: null,
        attendance: attendance("excused"),
      })
    ).toBe("excused");
  });

  it("returns no_show when attendance flag = no_show, even with clock record", () => {
    expect(
      getShiftAttendanceState({
        shift,
        now: new Date(STARTS_AT_UTC_MS),
        clockRecord: rec({ status: "active" }),
        attendance: attendance("no_show"),
      })
    ).toBe("no_show");
  });

  it("returns clocked_in for an active record without flag", () => {
    expect(
      getShiftAttendanceState({
        shift,
        now: new Date(STARTS_AT_UTC_MS),
        clockRecord: rec({ status: "active" }),
        attendance: null,
      })
    ).toBe("clocked_in");
  });

  it("returns completed for a pending_review record", () => {
    expect(
      getShiftAttendanceState({
        shift,
        now: new Date(STARTS_AT_UTC_MS),
        clockRecord: rec({ status: "pending_review", clocked_out_at: "x" }),
        attendance: null,
      })
    ).toBe("completed");
  });

  it("returns completed for a locked record", () => {
    expect(
      getShiftAttendanceState({
        shift,
        now: new Date(STARTS_AT_UTC_MS),
        clockRecord: rec({ status: "locked", clocked_out_at: "x" }),
        attendance: null,
      })
    ).toBe("completed");
  });

  it("returns expected when shift hasn't started yet (no record, no flag)", () => {
    const before = new Date(STARTS_AT_UTC_MS - 60 * 60 * 1000);
    expect(
      getShiftAttendanceState({
        shift,
        now: before,
        clockRecord: null,
        attendance: null,
      })
    ).toBe("expected");
  });

  it("returns expected within MISSING_THRESHOLD_MINUTES of start", () => {
    const inside = new Date(
      STARTS_AT_UTC_MS + (MISSING_THRESHOLD_MINUTES - 1) * 60 * 1000
    );
    expect(
      getShiftAttendanceState({
        shift,
        now: inside,
        clockRecord: null,
        attendance: null,
      })
    ).toBe("expected");
  });

  it("returns expected exactly at MISSING_THRESHOLD_MINUTES (boundary, strict greater-than)", () => {
    const boundary = new Date(
      STARTS_AT_UTC_MS + MISSING_THRESHOLD_MINUTES * 60 * 1000
    );
    expect(
      getShiftAttendanceState({
        shift,
        now: boundary,
        clockRecord: null,
        attendance: null,
      })
    ).toBe("expected");
  });

  it("returns missing past MISSING_THRESHOLD_MINUTES with no record + no flag", () => {
    const past = new Date(
      STARTS_AT_UTC_MS + (MISSING_THRESHOLD_MINUTES + 1) * 60 * 1000
    );
    expect(
      getShiftAttendanceState({
        shift,
        now: past,
        clockRecord: null,
        attendance: null,
      })
    ).toBe("missing");
  });

  it("missing transitions to clocked_in once the user clocks in", () => {
    const past = new Date(
      STARTS_AT_UTC_MS + (MISSING_THRESHOLD_MINUTES + 5) * 60 * 1000
    );
    expect(
      getShiftAttendanceState({
        shift,
        now: past,
        clockRecord: rec({ status: "active" }),
        attendance: null,
      })
    ).toBe("clocked_in");
  });
});
