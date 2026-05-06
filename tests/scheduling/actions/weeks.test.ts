import { beforeEach, describe, expect, it } from "vitest";
import {
  addShiftAction,
  assignUserToShiftAction,
  createWeekAction,
  publishWeekAction,
  unassignUserFromShiftAction,
} from "@/scheduling/actions/weeks";
import { listShiftsForWeek } from "@/scheduling/data/weeks";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

describe("scheduling week server actions", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("rejects createWeek when not signed in", async () => {
    const r = await createWeekAction("2026-05-04");
    expect(r.success).toBe(false);
  });

  it("rejects createWeek when staff (non-manager)", async () => {
    signInAs("mock-staff-1");
    const r = await createWeekAction("2026-05-04");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/manager|owner/i);
  });

  it("manager can create week", async () => {
    signInAs("mock-manager-1");
    const r = await createWeekAction("2026-05-04");
    expect(r.success).toBe(true);
  });

  describe("publishWeekAction", () => {
    it("requires override note when there are coverage gaps", async () => {
      signInAs("mock-manager-1");
      const created = await createWeekAction("2026-05-04");
      const r = await publishWeekAction({ weekId: created.weekId! });
      expect(r.success).toBe(false);
      expect(r.requiresOverride).toBe(true);
      expect((r.gaps?.length ?? 0)).toBeGreaterThan(0);
    });

    it("succeeds with override note", async () => {
      signInAs("mock-manager-1");
      const created = await createWeekAction("2026-05-04");
      const r = await publishWeekAction({
        weekId: created.weekId!,
        overrideNote: "Friend dinner — we'll have only one bartender",
      });
      expect(r.success).toBe(true);
    });
  });

  describe("assignUserToShiftAction", () => {
    it("blocks unqualified users", async () => {
      signInAs("mock-manager-1");
      const created = await createWeekAction("2026-05-04");
      // Add a fresh PM shift for mod we can target.
      const add = await addShiftAction({
        weekId: created.weekId!,
        templateId: "schedule-template-pm",
        shiftDate: "2026-05-04",
        role: "mod",
        startTime: "17:00:00",
        endTime: "23:00:00",
      });
      expect(add.success).toBe(true);
      // Pat has only bartender; assigning to mod should fail.
      const r = await assignUserToShiftAction(
        add.shiftId!,
        "mock-staff-row-4"
      );
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/qualified/i);
    });

    it("blocks PT users when no availability covers the shift", async () => {
      signInAs("mock-manager-1");
      const created = await createWeekAction("2026-05-04");
      // Pat is qualified for bartender. Pat's seed availability is Tue/Wed/Thu
      // 17:00-23:59, NOT Monday. Add a PM bartender shift on Monday.
      const add = await addShiftAction({
        weekId: created.weekId!,
        templateId: "schedule-template-pm",
        shiftDate: "2026-05-04",
        role: "bartender",
        startTime: "17:00:00",
        endTime: "23:00:00",
      });
      const r = await assignUserToShiftAction(
        add.shiftId!,
        "mock-staff-row-4"
      );
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/availability/i);
    });

    it("succeeds when PT availability covers the shift", async () => {
      signInAs("mock-manager-1");
      const created = await createWeekAction("2026-05-04");
      // Pat's Tue 17:00-23:59 covers a PM bartender shift on the Tuesday.
      const add = await addShiftAction({
        weekId: created.weekId!,
        templateId: "schedule-template-pm",
        shiftDate: "2026-05-05",
        role: "bartender",
        startTime: "17:00:00",
        endTime: "23:00:00",
      });
      const r = await assignUserToShiftAction(
        add.shiftId!,
        "mock-staff-row-4"
      );
      expect(r.success).toBe(true);
    });

    it("blocks same-day overlapping shifts", async () => {
      signInAs("mock-manager-1");
      const created = await createWeekAction("2026-05-04");
      // Tue PM bartender for Pat
      const a = await addShiftAction({
        weekId: created.weekId!,
        templateId: "schedule-template-pm",
        shiftDate: "2026-05-05",
        role: "bartender",
        startTime: "17:00:00",
        endTime: "20:00:00",
      });
      const ok = await assignUserToShiftAction(
        a.shiftId!,
        "mock-staff-row-4"
      );
      expect(ok.success).toBe(true);

      // Overlapping — should be blocked.
      const b = await addShiftAction({
        weekId: created.weekId!,
        templateId: "schedule-template-pm",
        shiftDate: "2026-05-05",
        role: "bartender",
        startTime: "19:00:00",
        endTime: "22:00:00",
      });
      const conflict = await assignUserToShiftAction(
        b.shiftId!,
        "mock-staff-row-4"
      );
      expect(conflict.success).toBe(false);
      expect(conflict.error).toMatch(/overlap/i);
    });
  });

  describe("unassignUserFromShiftAction", () => {
    it("clears user_id", async () => {
      signInAs("mock-manager-1");
      const created = await createWeekAction("2026-05-04");
      const shifts = await listShiftsForWeek(created.weekId!);
      const sams = shifts.find(
        (s) => s.user_id === "mock-staff-row-1"
      );
      expect(sams).toBeDefined();
      const r = await unassignUserFromShiftAction(sams!.id);
      expect(r.success).toBe(true);
      const after = await listShiftsForWeek(created.weekId!);
      const sameId = after.find((s) => s.id === sams!.id);
      expect(sameId?.user_id).toBeNull();
    });
  });
});
