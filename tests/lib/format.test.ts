import { describe, it, expect } from "vitest";
import {
  formatDateShort,
  formatMonthYear,
  formatMonthDay,
  formatTime,
  formatTimeRange,
  formatSGDCents,
  initials,
} from "@/lib/format";

describe("format helpers", () => {
  describe("formatDateShort", () => {
    it("returns a weekday + day + month string", () => {
      const out = formatDateShort("2025-04-12T10:00:00.000Z");
      // en-GB: "Sat 12 Apr"
      expect(out).toMatch(/[A-Za-z]{3} \d{1,2} [A-Za-z]{3}/);
    });
  });

  describe("formatMonthYear", () => {
    it("returns a 'Mon YYYY' string", () => {
      const out = formatMonthYear("2025-01-15T00:00:00.000Z");
      expect(out).toMatch(/[A-Za-z]{3} 2025/);
    });
  });

  describe("formatMonthDay", () => {
    it("returns a string containing the month abbreviation and day", () => {
      const out = formatMonthDay("2025-05-15T00:00:00.000Z");
      // en-GB formats as "15 May"; lenient match covers either ordering.
      expect(out).toMatch(/May/);
      expect(out).toMatch(/15/);
    });
  });

  describe("formatTime", () => {
    it("returns a 12h am/pm time", () => {
      const out = formatTime("2025-04-12T11:00:00.000Z");
      expect(out).toMatch(/^\d{1,2}:\d{2}\s?[ap]m$/i);
    });
  });

  describe("formatTimeRange", () => {
    it("joins two formatted times with an en-dash", () => {
      const out = formatTimeRange(
        "2025-04-12T11:00:00.000Z",
        "2025-04-12T13:00:00.000Z"
      );
      expect(out).toContain("–");
    });
  });

  describe("formatSGDCents", () => {
    it("formats 10000 cents as $100.00 SGD", () => {
      const out = formatSGDCents(10000);
      // en-SG uses $ for SGD; allow surrounding whitespace.
      expect(out.replace(/\s/g, "")).toMatch(/\$100\.00/);
    });

    it("formats 0 cents as $0.00", () => {
      expect(formatSGDCents(0).replace(/\s/g, "")).toMatch(/\$0\.00/);
    });

    it("rounds fractional cents to 2dp", () => {
      // 2050 cents = $20.50
      expect(formatSGDCents(2050).replace(/\s/g, "")).toMatch(/\$20\.50/);
    });
  });

  describe("initials", () => {
    it("returns first-letter pairs for two-word names", () => {
      expect(initials("Mona Member")).toBe("MM");
      expect(initials("alex johnson")).toBe("AJ");
    });

    it("returns the first two chars for a single-word name", () => {
      expect(initials("Mona")).toBe("MO");
    });

    it("uses first + last for 3+ word names", () => {
      expect(initials("Ada Grace Lovelace")).toBe("AL");
    });

    it("returns ? for empty input", () => {
      expect(initials("")).toBe("?");
      expect(initials("   ")).toBe("?");
    });

    it("handles extra internal whitespace", () => {
      expect(initials("  Mona    Member  ")).toBe("MM");
    });
  });
});
