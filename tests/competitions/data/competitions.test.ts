import { describe, it, expect, beforeEach } from "vitest";
import {
  createCompetitionDraft,
  deleteCompetition,
  getCompetition,
  listCompetitions,
  updateCompetitionStatus,
  validateCompetitionShape,
} from "@/competitions/data/competitions";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("competitions data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("seeds two drafts (one tournament, one league)", async () => {
    const all = await listCompetitions();
    expect(all.length).toBe(2);
    expect(all.some((c) => c.kind === "tournament")).toBe(true);
    expect(all.some((c) => c.kind === "league" && c.entrant_type === "team")).toBe(true);
  });

  it("creates a draft tournament", async () => {
    const res = await createCompetitionDraft({
      name: "Autumn 8-ball",
      description: null,
      kind: "tournament",
      format: "double_elim",
      entrant_type: "individual",
      game_type_id: "eight_ball",
      guest_policy: "members_only",
      team_match_config: null,
      registration_opens_at: null,
      registration_closes_at: null,
      starts_at: null,
      ends_at: null,
      created_by_staff_id: "mock-staff-row-3",
    });
    expect(res.success).toBe(true);
    const row = await getCompetition(res.id!);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("draft");
    expect(row!.format).toBe("double_elim");
  });

  it("rejects a tournament without a format", async () => {
    const res = await createCompetitionDraft({
      name: "Bad tournament",
      description: null,
      kind: "tournament",
      format: null,
      entrant_type: "individual",
      game_type_id: "eight_ball",
      guest_policy: "members_only",
      team_match_config: null,
      registration_opens_at: null,
      registration_closes_at: null,
      starts_at: null,
      ends_at: null,
      created_by_staff_id: null,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/format/i);
  });

  it("rejects a league that uses individual entrants", async () => {
    const res = await createCompetitionDraft({
      name: "Bad league",
      description: null,
      kind: "league",
      format: null,
      entrant_type: "individual",
      game_type_id: "eight_ball",
      guest_policy: "members_only",
      team_match_config: null,
      registration_opens_at: null,
      registration_closes_at: null,
      starts_at: null,
      ends_at: null,
      created_by_staff_id: null,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/team/i);
  });

  it("rejects a casual competition with a format set", async () => {
    const res = await createCompetitionDraft({
      name: "Bad casual",
      description: null,
      kind: "casual",
      format: "swiss",
      entrant_type: "individual",
      game_type_id: "eight_ball",
      guest_policy: "members_only",
      team_match_config: null,
      registration_opens_at: null,
      registration_closes_at: null,
      starts_at: null,
      ends_at: null,
      created_by_staff_id: null,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/format/i);
  });

  it("updates a status transition", async () => {
    const res = await updateCompetitionStatus(
      "comp-tournament-draft-1",
      "registration_open"
    );
    expect(res.success).toBe(true);
    const row = await getCompetition("comp-tournament-draft-1");
    expect(row!.status).toBe("registration_open");
  });

  it("deletes a draft and cascades entrants", async () => {
    const before = (await listCompetitions()).length;
    const res = await deleteCompetition("comp-tournament-draft-1");
    expect(res.success).toBe(true);
    const after = await listCompetitions();
    expect(after.length).toBe(before - 1);
    expect(after.some((c) => c.id === "comp-tournament-draft-1")).toBe(false);
    // Cascade: entrants for that competition are gone.
    const { listEntrants } = await import("@/competitions/data/entrants");
    const ents = await listEntrants("comp-tournament-draft-1");
    expect(ents.length).toBe(0);
  });

  it("refuses to delete a non-draft competition", async () => {
    await updateCompetitionStatus(
      "comp-tournament-draft-1",
      "registration_open"
    );
    const res = await deleteCompetition("comp-tournament-draft-1");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/draft/i);
  });

  it("validateCompetitionShape flags invalid combinations", () => {
    expect(
      validateCompetitionShape({ kind: "tournament", format: null, entrant_type: "individual" })
    ).not.toBeNull();
    expect(
      validateCompetitionShape({ kind: "league", format: null, entrant_type: "individual" })
    ).not.toBeNull();
    expect(
      validateCompetitionShape({ kind: "casual", format: null, entrant_type: "individual" })
    ).toBeNull();
  });
});
