import { describe, it, expect, beforeEach } from "vitest";
import {
  clearLineup,
  getBlockingApprovalState,
  getLineup,
  listRejectedSubstitutionsForCaptain,
  setLineup,
} from "@/competitions/data/lineups";
import { MOCK_COMP_MATCH_LINEUPS } from "@/competitions/data/mock-data";
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

// =============================================================================
// getBlockingApprovalState — Fix 2 unit coverage.
// =============================================================================

describe("getBlockingApprovalState", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("returns 'pending' when both pending and rejected rows exist (pending wins)", async () => {
    const matchId = "comp-match-lg-3-s2";
    const nowIso = new Date().toISOString();
    // Inject one rejected row and one pending row on the same match.
    MOCK_COMP_MATCH_LINEUPS.push({
      match_id: matchId,
      entrant_id: "comp-entrant-sp-felt",
      member_id: "mock-member-row-2",
      side: "a",
      recorded_at: nowIso,
      approval_status: "rejected",
      approved_by_member_id: "mock-member-row-3",
      approved_at: nowIso,
      approval_note: "Not on the league register",
    });
    MOCK_COMP_MATCH_LINEUPS.push({
      match_id: matchId,
      entrant_id: "comp-entrant-sp-cue",
      member_id: "mock-member-row-4",
      side: "b",
      recorded_at: nowIso,
      approval_status: "pending",
      approved_by_member_id: null,
      approved_at: null,
      approval_note: null,
    });
    expect(await getBlockingApprovalState(matchId)).toBe("pending");
  });

  it("returns 'rejected' when only rejected rows exist", async () => {
    const matchId = "comp-match-lg-3-s2";
    const nowIso = new Date().toISOString();
    MOCK_COMP_MATCH_LINEUPS.push({
      match_id: matchId,
      entrant_id: "comp-entrant-sp-felt",
      member_id: "mock-member-row-2",
      side: "a",
      recorded_at: nowIso,
      approval_status: "rejected",
      approved_by_member_id: "mock-member-row-3",
      approved_at: nowIso,
      approval_note: null,
    });
    expect(await getBlockingApprovalState(matchId)).toBe("rejected");
  });

  it("returns null when no pending or rejected rows exist", async () => {
    expect(await getBlockingApprovalState("comp-match-lg-3-s2")).toBe(null);
  });
});

// =============================================================================
// listRejectedSubstitutionsForCaptain — Fix 3 coverage.
// =============================================================================

describe("listRejectedSubstitutionsForCaptain", () => {
  beforeEach(() => {
    resetMockData();
  });

  const FELT_CAPTAIN = "mock-member-row-1"; // Felt Tips captain
  const CUE_CAPTAIN = "mock-member-row-3"; // Cue Crew captain
  const MATCH_ID = "comp-match-lg-3-s2";

  it("returns rejected rows on captain's own side", async () => {
    const nowIso = new Date().toISOString();
    MOCK_COMP_MATCH_LINEUPS.push({
      match_id: MATCH_ID,
      entrant_id: "comp-entrant-sp-felt",
      member_id: "mock-member-row-2",
      side: "a", // Felt Tips side
      recorded_at: nowIso,
      approval_status: "rejected",
      approved_by_member_id: CUE_CAPTAIN,
      approved_at: nowIso,
      approval_note: "Not on the league register",
    });
    const rows = await listRejectedSubstitutionsForCaptain(FELT_CAPTAIN);
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      matchId: MATCH_ID,
      subSide: "a",
      subMemberId: "mock-member-row-2",
      rejectedByMemberId: CUE_CAPTAIN,
      approvalNote: "Not on the league register",
    });
  });

  it("ignores pending rows", async () => {
    const nowIso = new Date().toISOString();
    MOCK_COMP_MATCH_LINEUPS.push({
      match_id: MATCH_ID,
      entrant_id: "comp-entrant-sp-felt",
      member_id: "mock-member-row-2",
      side: "a",
      recorded_at: nowIso,
      approval_status: "pending",
      approved_by_member_id: null,
      approved_at: null,
      approval_note: null,
    });
    const rows = await listRejectedSubstitutionsForCaptain(FELT_CAPTAIN);
    expect(rows).toEqual([]);
  });

  it("ignores rejections on the opposing side", async () => {
    const nowIso = new Date().toISOString();
    // Rejected sub on side b — Cue Crew's side, not Felt Tips'.
    MOCK_COMP_MATCH_LINEUPS.push({
      match_id: MATCH_ID,
      entrant_id: "comp-entrant-sp-cue",
      member_id: "mock-member-row-4",
      side: "b",
      recorded_at: nowIso,
      approval_status: "rejected",
      approved_by_member_id: FELT_CAPTAIN,
      approved_at: nowIso,
      approval_note: null,
    });
    const rowsForFelt =
      await listRejectedSubstitutionsForCaptain(FELT_CAPTAIN);
    expect(rowsForFelt).toEqual([]);
    // Cue captain should see it on their own side.
    const rowsForCue = await listRejectedSubstitutionsForCaptain(CUE_CAPTAIN);
    expect(rowsForCue.length).toBe(1);
    expect(rowsForCue[0]!.subSide).toBe("b");
  });
});
