import { describe, it, expect, beforeEach } from "vitest";
import {
  cancelFixtureAction,
  createFixtureAction,
  markFixtureCompleteAction,
  postponeFixtureAction,
} from "@/competitions/actions/fixtures";
import { setLineupAction } from "@/competitions/actions/lineups";
import { getFixture } from "@/competitions/data/fixtures";
import { getLineup } from "@/competitions/data/lineups";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

const LEAGUE = "comp-league-spring-premier";
const SCHEDULED_MATCH = "comp-match-lg-3-s2"; // scheduled, Felt(a) vs Cue(b)

describe("fixture server actions", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("manager can create a fixture", async () => {
    signInAs("mock-manager-1");
    const res = await createFixtureAction({
      competitionId: LEAGUE,
      homeEntrantId: "comp-entrant-sp-felt",
      awayEntrantId: "comp-entrant-sp-break",
      fixtureDate: "2026-04-01T19:00:00.000Z",
    });
    expect(res.success).toBe(true);
    const fx = await getFixture(res.id!);
    expect(fx!.status).toBe("scheduled");
  });

  it("anonymous cannot create a fixture", async () => {
    const res = await createFixtureAction({
      competitionId: LEAGUE,
      homeEntrantId: "comp-entrant-sp-felt",
      awayEntrantId: "comp-entrant-sp-break",
      fixtureDate: "2026-04-01T19:00:00.000Z",
    });
    expect(res.success).toBe(false);
  });

  it("staff cannot create a fixture", async () => {
    signInAs("mock-staff-1");
    const res = await createFixtureAction({
      competitionId: LEAGUE,
      homeEntrantId: "comp-entrant-sp-felt",
      awayEntrantId: "comp-entrant-sp-break",
      fixtureDate: "2026-04-01T19:00:00.000Z",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/manager/i);
  });

  it("cancelFixtureAction flips status", async () => {
    signInAs("mock-manager-1");
    const res = await cancelFixtureAction("comp-fixture-4", "Power cut");
    expect(res.success).toBe(true);
    const fx = await getFixture("comp-fixture-4");
    expect(fx!.status).toBe("cancelled");
    expect(fx!.notes).toBe("Power cut");
  });

  it("postponeFixtureAction updates date + status", async () => {
    signInAs("mock-manager-1");
    const res = await postponeFixtureAction(
      "comp-fixture-4",
      "2026-04-15T19:00:00.000Z"
    );
    expect(res.success).toBe(true);
    const fx = await getFixture("comp-fixture-4");
    expect(fx!.status).toBe("postponed");
  });

  it("markFixtureCompleteAction flips status", async () => {
    signInAs("mock-manager-1");
    const res = await markFixtureCompleteAction("comp-fixture-3");
    expect(res.success).toBe(true);
    const fx = await getFixture("comp-fixture-3");
    expect(fx!.status).toBe("completed");
  });

  it("captain can set lineup for their team's side", async () => {
    // Felt Tips captain is mock-member-1 (mock-member-row-1). Side a is Felt.
    signInAs("mock-member-1");
    const res = await setLineupAction({
      matchId: SCHEDULED_MATCH,
      side: "a",
      memberIds: ["mock-member-row-3"],
      slotKind: "singles",
    });
    expect(res.success).toBe(true);
    const lineups = await getLineup(SCHEDULED_MATCH);
    expect(lineups.some((l) => l.side === "a" && l.member_id === "mock-member-row-3")).toBe(true);
  });

  it("non-captain member cannot set lineup", async () => {
    // mock-member-2 (row-2) is captain of Chalk Dust, not Felt/Cue.
    signInAs("mock-member-2");
    const res = await setLineupAction({
      matchId: SCHEDULED_MATCH,
      side: "a",
      memberIds: ["mock-member-row-3"],
      slotKind: "singles",
    });
    expect(res.success).toBe(false);
  });

  it("manager can override and set any lineup", async () => {
    signInAs("mock-manager-1");
    const res = await setLineupAction({
      matchId: SCHEDULED_MATCH,
      side: "a",
      memberIds: ["mock-member-row-1"],
      slotKind: "singles",
    });
    expect(res.success).toBe(true);
  });
});
