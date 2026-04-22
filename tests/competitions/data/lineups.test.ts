import { describe, it, expect, beforeEach } from "vitest";
import {
  clearLineup,
  getLineup,
  setLineup,
} from "@/competitions/data/lineups";
import { resetMockData } from "../../helpers/reset-mock-data";

const COMPLETED_MATCH_ID = "comp-match-lg-3-s1";
const SCHEDULED_MATCH_ID = "comp-match-lg-3-s2";

describe("lineups data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("getLineup returns seeded lineup rows for a match", async () => {
    const lineups = await getLineup(COMPLETED_MATCH_ID);
    expect(lineups.length).toBe(2);
    expect(lineups.some((l) => l.side === "a")).toBe(true);
    expect(lineups.some((l) => l.side === "b")).toBe(true);
  });

  it("setLineup replaces the previous lineup on the same side", async () => {
    const res = await setLineup({
      matchId: SCHEDULED_MATCH_ID,
      side: "a",
      memberIds: ["mock-member-row-3"],
      slotKind: "singles",
    });
    expect(res.success).toBe(true);
    const lineups = await getLineup(SCHEDULED_MATCH_ID);
    const sideA = lineups.filter((l) => l.side === "a");
    expect(sideA.length).toBe(1);
    expect(sideA[0]!.member_id).toBe("mock-member-row-3");
  });

  it("setLineup rejects wrong member count for singles", async () => {
    const res = await setLineup({
      matchId: SCHEDULED_MATCH_ID,
      side: "a",
      memberIds: ["mock-member-row-1", "mock-member-row-3"],
      slotKind: "singles",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/requires 1/);
  });

  it("setLineup rejects wrong member count for doubles", async () => {
    const res = await setLineup({
      matchId: SCHEDULED_MATCH_ID,
      side: "a",
      memberIds: ["mock-member-row-1"],
      slotKind: "doubles",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/requires 2/);
  });

  it("setLineup rejects duplicate members", async () => {
    const res = await setLineup({
      matchId: SCHEDULED_MATCH_ID,
      side: "a",
      memberIds: ["mock-member-row-1", "mock-member-row-1"],
      slotKind: "doubles",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/duplicate/i);
  });

  it("setLineup rejects members not on the team's roster (strict)", async () => {
    const res = await setLineup({
      matchId: SCHEDULED_MATCH_ID,
      side: "a",
      memberIds: ["mock-member-row-2"], // Felt Tips roster: members 1 and 3
      slotKind: "singles",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/roster/i);
  });

  it("clearLineup wipes rows for a (match, side)", async () => {
    // Use completed match which already has lineups seeded on both sides.
    await clearLineup(COMPLETED_MATCH_ID, "a");
    const lineups = await getLineup(COMPLETED_MATCH_ID);
    expect(lineups.some((l) => l.side === "a")).toBe(false);
    expect(lineups.some((l) => l.side === "b")).toBe(true);
  });

  it("setLineup rejects when match is completed", async () => {
    // comp-match-lg-1-s1 is completed
    const res = await setLineup({
      matchId: "comp-match-lg-1-s1",
      side: "a",
      memberIds: ["mock-member-row-1"],
      slotKind: "singles",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/complete/i);
  });
});
