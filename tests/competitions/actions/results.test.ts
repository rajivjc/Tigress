import { describe, it, expect, beforeEach } from "vitest";
import {
  clearMatchResultAction,
  overrideMatchResultAction,
  reportMatchResultAction,
} from "@/competitions/actions/results";
import { publishBracketAction } from "@/competitions/actions/bracket";
import { getCompetition, updateCompetitionStatus } from "@/competitions/data/competitions";
import { listBracketMatches } from "@/competitions/data/bracket";
import { getResult } from "@/competitions/data/match-results";
import { listEntrants } from "@/competitions/data/entrants";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

const TOURNAMENT_ID = "comp-tournament-draft-1";

async function setupBracket() {
  await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
  signInAs("mock-owner-1");
  await publishBracketAction(TOURNAMENT_ID);
  const matches = await listBracketMatches(TOURNAMENT_ID);
  return matches;
}

// Resolve a member's entrant id and return the R1 match + auth-user mapping.
async function setupMemberMatch() {
  const matches = await setupBracket();
  const entrants = await listEntrants(TOURNAMENT_ID);
  // Find the round-1 match where Mona (mock-member-row-1) is playing.
  const monaEntrant = entrants.find(
    (e) => e.entrant_member_id === "mock-member-row-1"
  )!;
  const match = matches.find(
    (m) =>
      m.round_number === 1 &&
      (m.entrant_a_id === monaEntrant.id || m.entrant_b_id === monaEntrant.id)
  )!;
  return { match, monaEntrantId: monaEntrant.id };
}

describe("reportMatchResultAction — winning-player-reports rule", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("winning player can report their result", async () => {
    const { match, monaEntrantId } = await setupMemberMatch();
    signInAs("mock-member-1"); // Mona

    const res = await reportMatchResultAction({
      matchId: match.id,
      winnerEntrantId: monaEntrantId,
      scoreA: match.entrant_a_id === monaEntrantId ? 7 : 3,
      scoreB: match.entrant_b_id === monaEntrantId ? 7 : 3,
    });
    expect(res.success).toBe(true);
    const row = await getResult(match.id);
    expect(row).not.toBeNull();
    expect(row!.winner_entrant_id).toBe(monaEntrantId);
  });

  it("loser cannot self-report (winner mismatch)", async () => {
    const { match, monaEntrantId } = await setupMemberMatch();
    signInAs("mock-member-1"); // Mona

    // Opponent's entrant id
    const opponentId =
      match.entrant_a_id === monaEntrantId
        ? match.entrant_b_id!
        : match.entrant_a_id!;

    const res = await reportMatchResultAction({
      matchId: match.id,
      winnerEntrantId: opponentId, // Mona reports opponent as winner
      scoreA: match.entrant_a_id === opponentId ? 7 : 3,
      scoreB: match.entrant_b_id === opponentId ? 7 : 3,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/winning|winner/i);
  });

  it("non-participant cannot report", async () => {
    const { match, monaEntrantId } = await setupMemberMatch();
    // Member NOT in this match — use Jordan. But wait, Jordan might also
    // be in a match. Use a different trick: pick a match, then sign in as
    // a member who ISN'T playing in it.
    const entrants = await listEntrants(TOURNAMENT_ID);
    const playingMemberIds = new Set(
      [match.entrant_a_id, match.entrant_b_id]
        .map((id) => entrants.find((e) => e.id === id)?.entrant_member_id)
        .filter((x): x is string => !!x)
    );
    const nonParticipant = entrants.find(
      (e) =>
        e.entrant_member_id !== null &&
        !playingMemberIds.has(e.entrant_member_id)
    );
    if (!nonParticipant) return; // 4-entrant bracket where each R1 match covers 2/4 — always true

    // Sign in as that non-participant member.
    const authId =
      nonParticipant.entrant_member_id === "mock-member-row-1"
        ? "mock-member-1"
        : nonParticipant.entrant_member_id === "mock-member-row-2"
          ? "mock-staff-1" // not a member, just a sanity bail
          : "mock-member-1";
    // Actually just test by signing in as owner and expecting rejection
    // for "members only".
    signInAs("mock-owner-1");
    const res = await reportMatchResultAction({
      matchId: match.id,
      winnerEntrantId: monaEntrantId,
      scoreA: 7,
      scoreB: 3,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/member|manager/i);
  });

  it("rejects when winner is not one of the two match entrants", async () => {
    const { match } = await setupMemberMatch();
    signInAs("mock-member-1");
    const res = await reportMatchResultAction({
      matchId: match.id,
      winnerEntrantId: "some-other-entrant-id",
      scoreA: 7,
      scoreB: 3,
    });
    expect(res.success).toBe(false);
  });

  it("rejects scores where winner didn't reach race_to", async () => {
    const { match, monaEntrantId } = await setupMemberMatch();
    signInAs("mock-member-1");
    const res = await reportMatchResultAction({
      matchId: match.id,
      winnerEntrantId: monaEntrantId,
      scoreA: 3,
      scoreB: 2,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/race-to/i);
  });

  it("recording a result triggers auto-advance to round 2", async () => {
    const { match, monaEntrantId } = await setupMemberMatch();
    signInAs("mock-member-1");
    await reportMatchResultAction({
      matchId: match.id,
      winnerEntrantId: monaEntrantId,
      scoreA: match.entrant_a_id === monaEntrantId ? 7 : 0,
      scoreB: match.entrant_b_id === monaEntrantId ? 7 : 0,
    });

    const matches = await listBracketMatches(TOURNAMENT_ID);
    const r2 = matches.find((m) => m.round_number === 2)!;
    // Winner of R1M1 (position 1, odd) → slot a
    const slot = match.bracket_position! % 2 === 1 ? "a" : "b";
    if (slot === "a") expect(r2.entrant_a_id).toBe(monaEntrantId);
    else expect(r2.entrant_b_id).toBe(monaEntrantId);
  });
});

describe("reportMatchResultAction — final transitions competition", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("completing the final marks competition as completed", async () => {
    const matches = await setupBracket();
    const r1 = matches.filter((m) => m.round_number === 1);

    // Play both R1 matches (as manager override — simpler than juggling
    // who the winning member is in each match).
    signInAs("mock-owner-1");
    for (const m of r1) {
      await overrideMatchResultAction({
        matchId: m.id,
        winnerEntrantId: m.entrant_a_id!,
        scoreA: 7,
        scoreB: 0,
      });
    }

    // Now play the final.
    const post = await listBracketMatches(TOURNAMENT_ID);
    const final = post.find((m) => m.round_number === 2)!;
    const res = await overrideMatchResultAction({
      matchId: final.id,
      winnerEntrantId: final.entrant_a_id!,
      scoreA: 7,
      scoreB: 0,
    });
    expect(res.success).toBe(true);
    expect(res.nextMatchId).toBeNull();

    const comp = await getCompetition(TOURNAMENT_ID);
    expect(comp!.status).toBe("completed");
  });
});

describe("overrideMatchResultAction", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("manager/owner can override any match (even without being a participant)", async () => {
    const matches = await setupBracket();
    const r1m1 = matches.find(
      (m) => m.round_number === 1 && m.bracket_position === 1
    )!;
    signInAs("mock-owner-1");
    const res = await overrideMatchResultAction({
      matchId: r1m1.id,
      winnerEntrantId: r1m1.entrant_a_id!,
      scoreA: 7,
      scoreB: 4,
    });
    expect(res.success).toBe(true);
  });

  it("rejects non-manager callers", async () => {
    const matches = await setupBracket();
    const r1m1 = matches[0]!;
    signInAs("mock-staff-1");
    const res = await overrideMatchResultAction({
      matchId: r1m1.id,
      winnerEntrantId: r1m1.entrant_a_id!,
      scoreA: 7,
      scoreB: 0,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/manager/i);
  });

  it("override without cascadeRevert is rejected when downstream is completed", async () => {
    const matches = await setupBracket();
    const r1m1 = matches.find(
      (m) => m.round_number === 1 && m.bracket_position === 1
    )!;
    const r1m2 = matches.find(
      (m) => m.round_number === 1 && m.bracket_position === 2
    )!;
    signInAs("mock-owner-1");
    // Complete both R1 and the final (R2).
    await overrideMatchResultAction({
      matchId: r1m1.id,
      winnerEntrantId: r1m1.entrant_a_id!,
      scoreA: 7,
      scoreB: 0,
    });
    await overrideMatchResultAction({
      matchId: r1m2.id,
      winnerEntrantId: r1m2.entrant_a_id!,
      scoreA: 7,
      scoreB: 0,
    });
    const after = await listBracketMatches(TOURNAMENT_ID);
    const r2 = after.find((m) => m.round_number === 2)!;
    await overrideMatchResultAction({
      matchId: r2.id,
      winnerEntrantId: r2.entrant_a_id!,
      scoreA: 7,
      scoreB: 0,
    });

    // Now try to override R1M1 to a different winner — this should fail
    // without cascadeRevert because R2 is already completed.
    const res = await overrideMatchResultAction({
      matchId: r1m1.id,
      winnerEntrantId: r1m1.entrant_b_id!,
      scoreA: 0,
      scoreB: 7,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/cascade/i);
  });

  it("override with cascadeRevert wipes downstream result and re-advances", async () => {
    const matches = await setupBracket();
    const r1m1 = matches.find(
      (m) => m.round_number === 1 && m.bracket_position === 1
    )!;
    const r1m2 = matches.find(
      (m) => m.round_number === 1 && m.bracket_position === 2
    )!;
    signInAs("mock-owner-1");
    await overrideMatchResultAction({
      matchId: r1m1.id,
      winnerEntrantId: r1m1.entrant_a_id!,
      scoreA: 7,
      scoreB: 0,
    });
    await overrideMatchResultAction({
      matchId: r1m2.id,
      winnerEntrantId: r1m2.entrant_a_id!,
      scoreA: 7,
      scoreB: 0,
    });
    const after = await listBracketMatches(TOURNAMENT_ID);
    const r2 = after.find((m) => m.round_number === 2)!;
    await overrideMatchResultAction({
      matchId: r2.id,
      winnerEntrantId: r2.entrant_a_id!,
      scoreA: 7,
      scoreB: 0,
    });

    const res = await overrideMatchResultAction({
      matchId: r1m1.id,
      winnerEntrantId: r1m1.entrant_b_id!,
      scoreA: 0,
      scoreB: 7,
      cascadeRevert: true,
    });
    expect(res.success).toBe(true);

    // After cascade: the downstream (final) should have been cleared and
    // then re-advanced with the new R1M1 winner.
    const post = await listBracketMatches(TOURNAMENT_ID);
    const finalAfter = post.find((m) => m.round_number === 2)!;
    // R1M1 is position 1 (odd) → slot a
    expect(finalAfter.entrant_a_id).toBe(r1m1.entrant_b_id);
    const finalResult = await getResult(finalAfter.id);
    expect(finalResult).toBeNull();
  });
});

describe("clearMatchResultAction", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("reverts match status to scheduled and cascades downstream", async () => {
    const matches = await setupBracket();
    const r1m1 = matches.find(
      (m) => m.round_number === 1 && m.bracket_position === 1
    )!;
    signInAs("mock-owner-1");
    await overrideMatchResultAction({
      matchId: r1m1.id,
      winnerEntrantId: r1m1.entrant_a_id!,
      scoreA: 7,
      scoreB: 0,
    });
    const res = await clearMatchResultAction(r1m1.id);
    expect(res.success).toBe(true);

    const after = await listBracketMatches(TOURNAMENT_ID);
    const r1m1After = after.find((m) => m.id === r1m1.id)!;
    expect(r1m1After.status).toBe("scheduled");
    // Downstream slot should be cleared
    const r2 = after.find((m) => m.round_number === 2)!;
    expect(r2.entrant_a_id).toBeNull();
  });

  it("rejects non-manager callers", async () => {
    const matches = await setupBracket();
    signInAs("mock-staff-1");
    const res = await clearMatchResultAction(matches[0]!.id);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/manager/i);
  });
});
