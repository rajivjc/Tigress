import { beforeEach, describe, expect, it } from "vitest";
import {
  clockIn,
  clockOut,
  getClockRecord,
  lockClockRecords,
  managerEditClockRecord,
  unlockClockRecord,
} from "@/scheduling/data/clock-records";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("clock records data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("clockIn → active, clockOut → pending_review", async () => {
    const inResult = await clockIn({ shiftId: "s-1", userId: "u-1" });
    expect(inResult.success).toBe(true);
    expect(inResult.record?.status).toBe("active");

    const outResult = await clockOut(inResult.record!.id);
    expect(outResult.success).toBe(true);
    expect(outResult.record?.status).toBe("pending_review");
    expect(outResult.record?.clocked_out_at).not.toBeNull();
  });

  it("blocks a second clockIn for the same shift+user", async () => {
    await clockIn({ shiftId: "s-1", userId: "u-1" });
    const r = await clockIn({ shiftId: "s-1", userId: "u-1" });
    expect(r.success).toBe(false);
  });

  it("rejects clockOut from a non-active record", async () => {
    const inResult = await clockIn({ shiftId: "s-1", userId: "u-1" });
    await clockOut(inResult.record!.id);
    const second = await clockOut(inResult.record!.id);
    expect(second.success).toBe(false);
  });

  it("lockClockRecords transitions pending_review → locked atomically", async () => {
    const a = await clockIn({ shiftId: "s-1", userId: "u-1" });
    const b = await clockIn({ shiftId: "s-2", userId: "u-2" });
    await clockOut(a.record!.id);
    await clockOut(b.record!.id);
    const r = await lockClockRecords([a.record!.id, b.record!.id], "u-mgr");
    expect(r.success).toBe(true);
    expect(r.locked).toBe(2);
    const re = await getClockRecord(a.record!.id);
    expect(re?.status).toBe("locked");
    expect(re?.locked_by).toBe("u-mgr");
  });

  it("lockClockRecords rejects when any record isn't pending_review (atomicity)", async () => {
    const a = await clockIn({ shiftId: "s-1", userId: "u-1" });
    const b = await clockIn({ shiftId: "s-2", userId: "u-2" });
    await clockOut(a.record!.id);
    // b is still active
    const r = await lockClockRecords([a.record!.id, b.record!.id], "u-mgr");
    expect(r.success).toBe(false);
    // a should NOT have been locked — atomicity guarantee.
    const aRefetch = await getClockRecord(a.record!.id);
    expect(aRefetch?.status).toBe("pending_review");
  });

  it("unlockClockRecord requires a note and returns to pending_review", async () => {
    const a = await clockIn({ shiftId: "s-1", userId: "u-1" });
    await clockOut(a.record!.id);
    await lockClockRecords([a.record!.id], "u-mgr");

    const noNote = await unlockClockRecord(a.record!.id, "");
    expect(noNote.success).toBe(false);

    const ok = await unlockClockRecord(a.record!.id, "Payroll correction needed");
    expect(ok.success).toBe(true);
    expect(ok.record?.status).toBe("pending_review");
    expect(ok.record?.unlock_note).toMatch(/payroll/i);
  });

  it("managerEditClockRecord stamps note + manager_edited and rejects locked", async () => {
    const a = await clockIn({ shiftId: "s-1", userId: "u-1" });
    await clockOut(a.record!.id);
    const e = await managerEditClockRecord({
      recordId: a.record!.id,
      clockedInAt: "2026-05-04T02:05:00Z",
      clockedOutAt: "2026-05-04T10:05:00Z",
      note: "fixed late clock-in",
    });
    expect(e.success).toBe(true);
    expect(e.record?.manager_edited).toBe(true);

    await lockClockRecords([a.record!.id], "u-mgr");
    const blocked = await managerEditClockRecord({
      recordId: a.record!.id,
      clockedInAt: "2026-05-04T02:00:00Z",
      clockedOutAt: "2026-05-04T10:00:00Z",
      note: "second edit",
    });
    expect(blocked.success).toBe(false);
  });
});
