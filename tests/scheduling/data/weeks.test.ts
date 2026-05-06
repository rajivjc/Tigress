import { beforeEach, describe, expect, it } from "vitest";
import {
  addShift,
  archiveWeek,
  copyFromPreviousWeek,
  createWeek,
  getWeek,
  listShiftsForWeek,
  listWeeks,
  publishWeek,
  removeShift,
  setShiftTimes,
  setShiftUser,
  unpublishWeek,
} from "@/scheduling/data/weeks";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("weeks data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  describe("createWeek", () => {
    it("creates a draft week and materialises FT shifts", async () => {
      const r = await createWeek("2026-05-04");
      expect(r.success).toBe(true);
      expect(r.week?.status).toBe("draft");
      const shifts = await listShiftsForWeek(r.week!.id);
      // Sam (AM bartender Mon-Fri) + Maya (PM mod Mon-Fri) = 10 shifts
      expect(shifts.length).toBe(10);
    });

    it("idempotent — returns the existing week if already created", async () => {
      const a = await createWeek("2026-05-04");
      const b = await createWeek("2026-05-04");
      expect(a.week?.id).toBe(b.week?.id);
    });
  });

  describe("status transitions", () => {
    it("publishes a draft week", async () => {
      const r = await createWeek("2026-05-11");
      const pub = await publishWeek({
        weekId: r.week!.id,
        publisherStaffId: "mock-staff-row-2",
        overrideNote: null,
      });
      expect(pub.success).toBe(true);
      const after = await getWeek(r.week!.id);
      expect(after?.status).toBe("published");
      expect(after?.published_by).toBe("mock-staff-row-2");
    });

    it("rejects publish from non-draft", async () => {
      const r = await createWeek("2026-05-18");
      await publishWeek({
        weekId: r.week!.id,
        publisherStaffId: "mock-staff-row-2",
        overrideNote: null,
      });
      const second = await publishWeek({
        weekId: r.week!.id,
        publisherStaffId: "mock-staff-row-2",
        overrideNote: null,
      });
      expect(second.success).toBe(false);
    });

    it("unpublishes a published week", async () => {
      const r = await createWeek("2026-05-25");
      await publishWeek({
        weekId: r.week!.id,
        publisherStaffId: "mock-staff-row-2",
        overrideNote: null,
      });
      const unpub = await unpublishWeek(r.week!.id);
      expect(unpub.success).toBe(true);
      const after = await getWeek(r.week!.id);
      expect(after?.status).toBe("draft");
      expect(after?.published_at).toBeNull();
    });

    it("archives a week", async () => {
      const r = await createWeek("2026-04-27");
      const arch = await archiveWeek(r.week!.id);
      expect(arch.success).toBe(true);
      const after = await getWeek(r.week!.id);
      expect(after?.status).toBe("archived");
    });
  });

  describe("shift CRUD", () => {
    it("adds, reassigns, retimes, and removes a shift", async () => {
      const r = await createWeek("2026-06-01");
      const add = await addShift({
        weekId: r.week!.id,
        templateId: "schedule-template-pm",
        shiftDate: "2026-06-05",
        role: "bartender",
        startTime: "17:00:00",
        endTime: "23:00:00",
      });
      expect(add.success).toBe(true);

      const assign = await setShiftUser(add.shiftId!, "mock-staff-row-4");
      expect(assign.success).toBe(true);

      const retime = await setShiftTimes(
        add.shiftId!,
        "18:00:00",
        "23:30:00"
      );
      expect(retime.success).toBe(true);

      const rem = await removeShift(add.shiftId!);
      expect(rem.success).toBe(true);
    });

    it("rejects setShiftTimes when end<=start", async () => {
      const r = await createWeek("2026-06-08");
      const add = await addShift({
        weekId: r.week!.id,
        templateId: "schedule-template-am",
        shiftDate: "2026-06-08",
        role: "bartender",
        startTime: "10:00:00",
        endTime: "14:00:00",
      });
      const retime = await setShiftTimes(
        add.shiftId!,
        "12:00:00",
        "10:00:00"
      );
      expect(retime.success).toBe(false);
    });
  });

  describe("copyFromPreviousWeek", () => {
    it("carries over manual assignments where qualifications still match", async () => {
      // Build the previous week with a manual extra shift for Pat.
      const prev = await createWeek("2026-05-04");
      const extra = await addShift({
        weekId: prev.week!.id,
        templateId: "schedule-template-pm",
        shiftDate: "2026-05-08",
        role: "bartender",
        startTime: "17:00:00",
        endTime: "23:00:00",
        userId: "mock-staff-row-4",
      });
      expect(extra.success).toBe(true);

      const map = new Map<
        string,
        Array<"bartender" | "floor" | "mod">
      >([
        [
          "mock-staff-row-4",
          ["bartender" as const],
        ],
      ]);

      const copied = await copyFromPreviousWeek(
        "2026-05-11",
        "2026-05-04",
        map
      );
      expect(copied.success).toBe(true);
      const newShifts = await listShiftsForWeek(copied.week!.id);
      const carried = newShifts.find(
        (s) =>
          s.user_id === "mock-staff-row-4" && s.shift_date === "2026-05-15"
      );
      expect(carried).toBeDefined();
    });

    it("skips manual assignments where the user no longer has the qualification", async () => {
      const prev = await createWeek("2026-06-15");
      await addShift({
        weekId: prev.week!.id,
        templateId: "schedule-template-pm",
        shiftDate: "2026-06-19",
        role: "bartender",
        startTime: "17:00:00",
        endTime: "23:00:00",
        userId: "mock-staff-row-4",
      });

      // Empty quals => no carry-over.
      const copied = await copyFromPreviousWeek(
        "2026-06-22",
        "2026-06-15",
        new Map()
      );
      expect(copied.success).toBe(true);
      const newShifts = await listShiftsForWeek(copied.week!.id);
      const carried = newShifts.find(
        (s) =>
          s.user_id === "mock-staff-row-4" && s.shift_date === "2026-06-26"
      );
      expect(carried).toBeUndefined();
    });
  });

  describe("listWeeks", () => {
    it("returns weeks sorted by start_date", async () => {
      await createWeek("2026-09-07");
      await createWeek("2026-08-31");
      const weeks = await listWeeks();
      expect(weeks[0].week_start_date.localeCompare(weeks[1].week_start_date))
        .toBeLessThanOrEqual(0);
    });
  });
});
