import { describe, it, expect, beforeEach } from "vitest";
import {
  archiveTeam,
  createTeam,
  getTeam,
  listTeams,
  updateTeam,
} from "@/competitions/data/teams";
import {
  addToRoster,
  listRoster,
  removeFromRoster,
} from "@/competitions/data/team-members";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("competitions teams + roster data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("seeds two active teams", async () => {
    const active = await listTeams({ status: "active" });
    expect(active.length).toBe(2);
    expect(active.map((t) => t.name).sort()).toEqual(["Chalk Dust", "Felt Tips"]);
  });

  it("creates a new team", async () => {
    const res = await createTeam({
      name: "Green Cloth",
      captain_member_id: "mock-member-row-3",
    });
    expect(res.success).toBe(true);
    const team = await getTeam(res.id!);
    expect(team!.status).toBe("active");
  });

  it("rejects a too-short team name", async () => {
    const res = await createTeam({
      name: "",
      captain_member_id: "mock-member-row-3",
    });
    expect(res.success).toBe(false);
  });

  it("archiving flips status but keeps the row", async () => {
    const res = await archiveTeam("comp-team-felt-tips");
    expect(res.success).toBe(true);
    const row = await getTeam("comp-team-felt-tips");
    expect(row!.status).toBe("archived");
  });

  it("updateTeam trims and validates the new name", async () => {
    const res = await updateTeam("comp-team-felt-tips", { name: "  Felt Tips 2.0  " });
    expect(res.success).toBe(true);
    const row = await getTeam("comp-team-felt-tips");
    expect(row!.name).toBe("Felt Tips 2.0");
  });

  it("lists the roster for a seeded team", async () => {
    const roster = await listRoster("comp-team-felt-tips");
    expect(roster.length).toBe(2);
    expect(roster.map((r) => r.member_id).sort()).toEqual([
      "mock-member-row-1",
      "mock-member-row-3",
    ]);
  });

  it("adds and removes a roster entry", async () => {
    const add = await addToRoster("comp-team-chalk-dust", "mock-member-row-3");
    expect(add.success).toBe(true);
    const after = await listRoster("comp-team-chalk-dust");
    expect(after.length).toBe(3);

    const rm = await removeFromRoster("comp-team-chalk-dust", "mock-member-row-3");
    expect(rm.success).toBe(true);
    const final = await listRoster("comp-team-chalk-dust");
    expect(final.length).toBe(2);
  });

  it("refuses to double-add the same member", async () => {
    const res = await addToRoster("comp-team-felt-tips", "mock-member-row-1");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/already/i);
  });
});
