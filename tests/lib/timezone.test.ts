import { describe, it, expect } from "vitest";
import {
  VENUE_TIMEZONE,
  todaySGT,
  formatDateSGT,
  startOfDaySGT,
  dateAtHourSGT,
  addDaysSGT,
  hourOfDaySGT,
} from "@/lib/timezone";

describe("timezone helpers (Asia/Singapore, UTC+8)", () => {
  describe("VENUE_TIMEZONE", () => {
    it("is fixed to Asia/Singapore", () => {
      expect(VENUE_TIMEZONE).toBe("Asia/Singapore");
    });
  });

  describe("formatDateSGT", () => {
    it("formats a known UTC instant as YYYY-MM-DD in SGT", () => {
      // 2025-04-11 18:30 UTC → 2025-04-12 02:30 SGT → next calendar day
      const date = new Date("2025-04-11T18:30:00.000Z");
      expect(formatDateSGT(date)).toBe("2025-04-12");
    });

    it("keeps the same date for early-UTC times still in the same SGT day", () => {
      // 2025-04-11 00:00 UTC → 2025-04-11 08:00 SGT → same day
      const date = new Date("2025-04-11T00:00:00.000Z");
      expect(formatDateSGT(date)).toBe("2025-04-11");
    });

    it("handles year/month rollover at the SGT boundary", () => {
      // 2024-12-31 17:00 UTC → 2025-01-01 01:00 SGT
      const date = new Date("2024-12-31T17:00:00.000Z");
      expect(formatDateSGT(date)).toBe("2025-01-01");
    });
  });

  describe("todaySGT", () => {
    it("matches formatDateSGT(new Date())", () => {
      expect(todaySGT()).toBe(formatDateSGT(new Date()));
    });

    it("returns a valid YYYY-MM-DD string", () => {
      expect(todaySGT()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("startOfDaySGT", () => {
    it("returns the correct UTC instant for SGT midnight", () => {
      // SGT midnight on 2025-04-12 is 2025-04-11 16:00 UTC.
      const start = startOfDaySGT("2025-04-12");
      expect(start.toISOString()).toBe("2025-04-11T16:00:00.000Z");
    });

    it("rolls back across the month boundary", () => {
      const start = startOfDaySGT("2025-05-01");
      expect(start.toISOString()).toBe("2025-04-30T16:00:00.000Z");
    });

    it("throws on malformed input", () => {
      expect(() => startOfDaySGT("not-a-date")).toThrow();
      expect(() => startOfDaySGT("")).toThrow();
    });
  });

  describe("dateAtHourSGT", () => {
    it("returns the exact UTC instant for a given SGT hour", () => {
      // 10:00 SGT on 2025-04-12 = 02:00 UTC same day.
      const d = dateAtHourSGT("2025-04-12", 10);
      expect(d.toISOString()).toBe("2025-04-12T02:00:00.000Z");
    });

    it("handles the 23:00 closing hour", () => {
      // 23:00 SGT on 2025-04-12 = 15:00 UTC same day.
      const d = dateAtHourSGT("2025-04-12", 23);
      expect(d.toISOString()).toBe("2025-04-12T15:00:00.000Z");
    });

    it("handles hour 0 (midnight start)", () => {
      const d = dateAtHourSGT("2025-04-12", 0);
      expect(d.toISOString()).toBe("2025-04-11T16:00:00.000Z");
    });
  });

  describe("addDaysSGT", () => {
    it("adds days forward and returns a YYYY-MM-DD string", () => {
      expect(addDaysSGT("2025-04-12", 3)).toBe("2025-04-15");
    });

    it("subtracts days with a negative value", () => {
      expect(addDaysSGT("2025-04-12", -5)).toBe("2025-04-07");
    });

    it("crosses month boundaries", () => {
      expect(addDaysSGT("2025-04-30", 2)).toBe("2025-05-02");
    });

    it("crosses year boundaries", () => {
      expect(addDaysSGT("2024-12-30", 3)).toBe("2025-01-02");
    });

    it("returns the same date when adding 0", () => {
      expect(addDaysSGT("2025-04-12", 0)).toBe("2025-04-12");
    });
  });

  describe("hourOfDaySGT", () => {
    it("returns the SGT hour-of-day, not the host hour", () => {
      // 2025-04-11 18:30 UTC → 2025-04-12 02:30 SGT → hour 2
      const date = new Date("2025-04-11T18:30:00.000Z");
      expect(hourOfDaySGT(date)).toBe(2);
    });

    it("returns 23 for SGT 23:xx", () => {
      const date = new Date("2025-04-12T15:15:00.000Z");
      expect(hourOfDaySGT(date)).toBe(23);
    });

    it("returns 10 for 10:00 SGT", () => {
      const date = new Date("2025-04-12T02:00:00.000Z");
      expect(hourOfDaySGT(date)).toBe(10);
    });
  });
});
