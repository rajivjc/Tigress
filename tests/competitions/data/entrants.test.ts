import { describe, it, expect, beforeEach } from "vitest";
import {
  addEntrant,
  listEntrants,
  listEntrantsEnriched,
  removeEntrant,
  setSeedNumbers,
} from "@/competitions/data/entrants";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("competitions entrants data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("seeds 4 tournament entrants ordered by seed", async () => {
    const ents = await listEntrants("comp-tournament-draft-1");
    expect(ents.length).toBe(4);
    expect(ents.map((e) => e.seed_number)).toEqual([1, 2, 3, 4]);
  });

  it("adds a member entrant", async () => {
    // First create a competition to add to with no entrants
    const { createCompetitionDraft } = await import(
      "@/competitions/data/competitions"
    );
    const draft = await createCompetitionDraft({
      name: "Empty tournament",
      description: null,
      kind: "casual",
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
    const res = await addEntrant(draft.id!, {
      kind: "member",
      id: "mock-member-row-1",
    });
    expect(res.success).toBe(true);
    const ents = await listEntrants(draft.id!);
    expect(ents.length).toBe(1);
    expect(ents[0]!.entrant_member_id).toBe("mock-member-row-1");
  });

  it("rejects duplicate entrants in the same competition", async () => {
    const res = await addEntrant("comp-tournament-draft-1", {
      kind: "member",
      id: "mock-member-row-1",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/already/i);
  });

  it("adds a guest entrant", async () => {
    const res = await addEntrant("comp-tournament-draft-1", {
      kind: "guest",
      id: "comp-guest-1",
    });
    expect(res.success).toBe(true);
  });

  it("removes an entrant", async () => {
    const ents = await listEntrants("comp-tournament-draft-1");
    const victim = ents[0]!;
    const res = await removeEntrant(victim.id);
    expect(res.success).toBe(true);
    const after = await listEntrants("comp-tournament-draft-1");
    expect(after.some((e) => e.id === victim.id)).toBe(false);
  });

  it("setSeedNumbers rejects duplicates in the payload", async () => {
    const ents = await listEntrants("comp-tournament-draft-1");
    const res = await setSeedNumbers("comp-tournament-draft-1", {
      [ents[0]!.id]: 5,
      [ents[1]!.id]: 5,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/duplicate/i);
  });

  it("listEntrantsEnriched resolves teams with a captain", async () => {
    const enriched = await listEntrantsEnriched("comp-league-draft-1");
    expect(enriched.length).toBe(2);
    const felt = enriched.find(
      (e) => e.subject?.kind === "team" && e.subject.team.name === "Felt Tips"
    );
    expect(felt).toBeTruthy();
    if (felt?.subject?.kind === "team") {
      expect(felt.subject.captain?.displayName).toBe("Mona Member");
    }
  });
});
