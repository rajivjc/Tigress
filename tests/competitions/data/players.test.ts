import { describe, it, expect, beforeEach } from "vitest";
import {
  entrantRowToPlayerRef,
  getCurrentPlayer,
  getPlayerById,
  getPlayersByRefs,
  listEligiblePlayers,
  playerRefToEntrantColumns,
} from "@/competitions/data/players";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

describe("competitions Player adapter (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("resolves a member with their skill level", async () => {
    const p = await getPlayerById({ kind: "member", id: "mock-member-row-1" });
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("member");
    expect(p!.displayName).toBe("Mona Member");
    expect(p!.skillLevel).toBe(5);
  });

  it("resolves a guest with paying flag", async () => {
    const p = await getPlayerById({ kind: "guest", id: "comp-guest-2" });
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("guest");
    if (p!.kind === "guest") {
      expect(p!.isPaying).toBe(true);
    }
  });

  it("resolves a staff member with role", async () => {
    const p = await getPlayerById({ kind: "staff", id: "mock-staff-row-2" });
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("staff");
    if (p!.kind === "staff") {
      expect(p!.role).toBe("manager");
    }
  });

  it("returns null for unknown id", async () => {
    const p = await getPlayerById({ kind: "member", id: "no-such-member" });
    expect(p).toBeNull();
  });

  it("batch-resolves mixed refs de-duplicated", async () => {
    const map = await getPlayersByRefs([
      { kind: "member", id: "mock-member-row-1" },
      { kind: "member", id: "mock-member-row-1" }, // duplicate
      { kind: "guest", id: "comp-guest-1" },
      { kind: "staff", id: "mock-staff-row-1" },
    ]);
    expect(map.size).toBe(3);
    expect(map.get("member:mock-member-row-1")?.displayName).toBe("Mona Member");
    expect(map.get("guest:comp-guest-1")?.displayName).toBe("Riley Guest");
    expect(map.get("staff:mock-staff-row-1")?.displayName).toBe("Sam Staff");
  });

  it("getCurrentPlayer returns null without a session", async () => {
    const p = await getCurrentPlayer();
    expect(p).toBeNull();
  });

  it("getCurrentPlayer returns the signed-in member", async () => {
    signInAs("mock-member-1");
    const p = await getCurrentPlayer();
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("member");
  });

  it("listEligiblePlayers respects the guest policy filter", async () => {
    const membersOnly = await listEligiblePlayers({ includeGuests: "none" });
    expect(membersOnly.every((p) => p.kind === "member")).toBe(true);

    const payingOnly = await listEligiblePlayers({
      includeMembers: false,
      includeGuests: "paying",
    });
    expect(payingOnly.every((p) => p.kind === "guest")).toBe(true);
    expect(payingOnly.every((p) => (p.kind === "guest" ? p.isPaying : false))).toBe(true);

    const invitedOnly = await listEligiblePlayers({
      includeMembers: false,
      includeGuests: "invited",
    });
    expect(invitedOnly.every((p) => p.kind === "guest" && !p.isPaying)).toBe(true);
  });

  it("entrantRowToPlayerRef maps columns", () => {
    expect(
      entrantRowToPlayerRef({
        entrant_member_id: "m1",
        entrant_guest_id: null,
        entrant_team_id: null,
      })
    ).toEqual({ kind: "member", id: "m1" });
    expect(
      entrantRowToPlayerRef({
        entrant_member_id: null,
        entrant_guest_id: "g1",
        entrant_team_id: null,
      })
    ).toEqual({ kind: "guest", id: "g1" });
    expect(
      entrantRowToPlayerRef({
        entrant_member_id: null,
        entrant_guest_id: null,
        entrant_team_id: "t1",
      })
    ).toEqual({ kind: "team", id: "t1" });
    expect(
      entrantRowToPlayerRef({
        entrant_member_id: null,
        entrant_guest_id: null,
        entrant_team_id: null,
      })
    ).toBeNull();
  });

  it("playerRefToEntrantColumns produces exactly-one-non-null columns", () => {
    expect(playerRefToEntrantColumns({ kind: "member", id: "m1" })).toEqual({
      entrant_member_id: "m1",
      entrant_guest_id: null,
      entrant_team_id: null,
    });
    expect(playerRefToEntrantColumns({ kind: "team", id: "t1" })).toEqual({
      entrant_member_id: null,
      entrant_guest_id: null,
      entrant_team_id: "t1",
    });
  });
});
