import { describe, it, expect, beforeEach } from "vitest";
import {
  finalizeDivisionPromotions,
  listPromotionDecisionsForDivision,
} from "@/competitions/data/promotions";
import {
  MOCK_COMP_DIVISIONS,
  MOCK_COMP_ENTRANTS,
  MOCK_COMP_PROMOTION_DECISIONS,
} from "@/competitions/data/mock-data";
import { resetMockData } from "../../helpers/reset-mock-data";

const SOURCE_DIV = "comp-division-spring-premier";
const TARGET_DIV = "comp-division-winter-premier"; // any other division id
const TARGET_COMP = "comp-tournament-draft-1"; // any pre-existing competition

describe("finalizeDivisionPromotions data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("inserts entrants into target competitions and writes decisions", async () => {
    const res = await finalizeDivisionPromotions(
      SOURCE_DIV,
      [
        {
          entrantId: "comp-entrant-sp-felt",
          decision: "stay",
          wasManualOverride: false,
          overrideNote: null,
          position: 1,
          sourceTeamId: "comp-team-felt-tips",
          targetCompetitionId: TARGET_COMP,
          targetDivisionId: TARGET_DIV,
        },
      ],
      "mock-staff-row-2"
    );
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.createdEntrantIds?.length).toBe(1);

    // Source division stamped finalized.
    const div = MOCK_COMP_DIVISIONS.find((d) => d.id === SOURCE_DIV)!;
    expect(div.promotions_finalized_at).not.toBeNull();
    expect(div.promotions_finalized_by).toBe("mock-staff-row-2");

    // New entrant created in the target competition.
    const created = MOCK_COMP_ENTRANTS.find(
      (e) => e.id === res.createdEntrantIds![0]
    )!;
    expect(created.competition_id).toBe(TARGET_COMP);
    expect(created.entrant_team_id).toBe("comp-team-felt-tips");
    expect(created.status).toBe("active");
  });

  it("listPromotionDecisionsForDivision returns the rows for that division ordered by position", async () => {
    await finalizeDivisionPromotions(
      SOURCE_DIV,
      [
        {
          entrantId: "comp-entrant-sp-cue",
          decision: "stay",
          wasManualOverride: false,
          overrideNote: null,
          position: 2,
          sourceTeamId: "comp-team-cue-crew",
          targetCompetitionId: TARGET_COMP,
          targetDivisionId: TARGET_DIV,
        },
        {
          entrantId: "comp-entrant-sp-felt",
          decision: "stay",
          wasManualOverride: false,
          overrideNote: null,
          position: 1,
          sourceTeamId: "comp-team-felt-tips",
          targetCompetitionId: TARGET_COMP,
          targetDivisionId: TARGET_DIV,
        },
      ],
      "mock-staff-row-2"
    );
    const out = await listPromotionDecisionsForDivision(SOURCE_DIV);
    expect(out.length).toBe(2);
    expect(out[0]!.source_position).toBe(1);
    expect(out[1]!.source_position).toBe(2);
  });

  it("refuses to finalize a division that is already finalized", async () => {
    const div = MOCK_COMP_DIVISIONS.find((d) => d.id === SOURCE_DIV)!;
    div.promotions_finalized_at = "2026-04-01T00:00:00.000Z";
    div.promotions_finalized_by = "mock-staff-row-2";

    const res = await finalizeDivisionPromotions(
      SOURCE_DIV,
      [
        {
          entrantId: "comp-entrant-sp-felt",
          decision: "stay",
          wasManualOverride: false,
          overrideNote: null,
          position: 1,
          sourceTeamId: "comp-team-felt-tips",
          targetCompetitionId: TARGET_COMP,
          targetDivisionId: TARGET_DIV,
        },
      ],
      "mock-staff-row-2"
    );
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/already finalized/i);
    }
  });

  it("refuses an empty decisions list", async () => {
    const res = await finalizeDivisionPromotions(
      SOURCE_DIV,
      [],
      "mock-staff-row-2"
    );
    expect(res.success).toBe(false);
    expect(MOCK_COMP_PROMOTION_DECISIONS.length).toBe(0);
  });
});
