import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptChangeRequest,
  createChangeRequest,
  getChangeRequest,
  setChangeRequestStatus,
} from "@/scheduling/data/shift-change-requests";
import { addShift, createWeek } from "@/scheduling/data/weeks";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("shift-change-requests data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  async function makeAssignedShift() {
    const week = await createWeek("2026-05-04");
    const add = await addShift({
      weekId: week.week!.id,
      templateId: "schedule-template-pm",
      shiftDate: "2026-05-05",
      role: "bartender",
      startTime: "17:00:00",
      endTime: "23:00:00",
      userId: "user-a",
    });
    return add.shiftId!;
  }

  it("creates a direct swap with a target", async () => {
    const shiftId = await makeAssignedShift();
    const r = await createChangeRequest({
      kind: "direct_swap",
      shiftId,
      requestedBy: "user-a",
      targetUserId: "user-b",
    });
    expect(r.success).toBe(true);
    expect(r.request?.kind).toBe("direct_swap");
    expect(r.request?.target_user_id).toBe("user-b");
  });

  it("rejects direct swap without target", async () => {
    const shiftId = await makeAssignedShift();
    const r = await createChangeRequest({
      kind: "direct_swap",
      shiftId,
      requestedBy: "user-a",
      targetUserId: null,
    });
    expect(r.success).toBe(false);
  });

  it("rejects giveaway with a target", async () => {
    const shiftId = await makeAssignedShift();
    const r = await createChangeRequest({
      kind: "giveaway",
      shiftId,
      requestedBy: "user-a",
      targetUserId: "user-b",
    });
    expect(r.success).toBe(false);
  });

  it("acceptChangeRequest flips the parent shift's user_id atomically", async () => {
    const shiftId = await makeAssignedShift();
    const create = await createChangeRequest({
      kind: "direct_swap",
      shiftId,
      requestedBy: "user-a",
      targetUserId: "user-b",
    });
    const r = await acceptChangeRequest(create.request!.id, "user-b");
    expect(r.success).toBe(true);

    const refetch = await getChangeRequest(create.request!.id);
    expect(refetch?.status).toBe("accepted");
    expect(refetch?.accepted_by).toBe("user-b");

    // The parent shift should now belong to user-b.
    const { getShift } = await import("@/scheduling/data/weeks");
    const shift = await getShift(shiftId);
    expect(shift?.user_id).toBe("user-b");
  });

  it("rejects accept by non-target user on direct swap", async () => {
    const shiftId = await makeAssignedShift();
    const c = await createChangeRequest({
      kind: "direct_swap",
      shiftId,
      requestedBy: "user-a",
      targetUserId: "user-b",
    });
    const r = await acceptChangeRequest(c.request!.id, "user-c");
    expect(r.success).toBe(false);
  });

  it("allows any acceptor to claim a giveaway", async () => {
    const shiftId = await makeAssignedShift();
    const c = await createChangeRequest({
      kind: "giveaway",
      shiftId,
      requestedBy: "user-a",
      targetUserId: null,
    });
    const r = await acceptChangeRequest(c.request!.id, "user-z");
    expect(r.success).toBe(true);
  });

  it("setChangeRequestStatus stamps reversal_note when status=reversed", async () => {
    const shiftId = await makeAssignedShift();
    const c = await createChangeRequest({
      kind: "direct_swap",
      shiftId,
      requestedBy: "user-a",
      targetUserId: "user-b",
    });
    await acceptChangeRequest(c.request!.id, "user-b");
    const r = await setChangeRequestStatus(
      c.request!.id,
      "reversed",
      "user-mgr",
      "Original assignee available again"
    );
    expect(r.success).toBe(true);
    expect(r.request?.status).toBe("reversed");
    expect(r.request?.reversal_note).toMatch(/available/);
  });
});
