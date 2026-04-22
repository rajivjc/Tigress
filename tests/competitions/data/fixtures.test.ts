import { describe, it, expect, beforeEach } from "vitest";
import {
  cancelFixture,
  createFixture,
  getFixture,
  getFixturesEnriched,
  listFixtures,
  postponeFixture,
  updateFixtureStatus,
} from "@/competitions/data/fixtures";
import { resetMockData } from "../../helpers/reset-mock-data";

const LEAGUE = "comp-league-spring-premier";

describe("fixtures data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("lists fixtures ordered by date", async () => {
    const fx = await listFixtures({ competitionId: LEAGUE });
    expect(fx.length).toBe(4);
    const dates = fx.map((f) => f.fixture_date);
    expect(dates).toEqual([...dates].sort());
  });

  it("filters by status", async () => {
    const completed = await listFixtures({
      competitionId: LEAGUE,
      status: "completed",
    });
    expect(completed.length).toBe(2);
    expect(completed.every((f) => f.status === "completed")).toBe(true);
  });

  it("creates a new fixture", async () => {
    const res = await createFixture({
      competition_id: LEAGUE,
      fixture_date: "2026-04-01T19:00:00.000Z",
      home_entrant_id: "comp-entrant-sp-felt",
      away_entrant_id: "comp-entrant-sp-break",
    });
    expect(res.success).toBe(true);
    const row = await getFixture(res.id!);
    expect(row!.status).toBe("scheduled");
  });

  it("rejects same home and away", async () => {
    const res = await createFixture({
      competition_id: LEAGUE,
      fixture_date: "2026-04-01T19:00:00.000Z",
      home_entrant_id: "comp-entrant-sp-felt",
      away_entrant_id: "comp-entrant-sp-felt",
    });
    expect(res.success).toBe(false);
  });

  it("rejects fixture for non-league competition", async () => {
    const res = await createFixture({
      competition_id: "comp-tournament-draft-1",
      fixture_date: "2026-04-01T19:00:00.000Z",
      home_entrant_id: "comp-entrant-sp-felt",
      away_entrant_id: "comp-entrant-sp-chalk",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/league/i);
  });

  it("rejects entrants from another competition", async () => {
    const res = await createFixture({
      competition_id: LEAGUE,
      fixture_date: "2026-04-01T19:00:00.000Z",
      home_entrant_id: "comp-entrant-t1-1", // entrant on tournament
      away_entrant_id: "comp-entrant-sp-chalk",
    });
    expect(res.success).toBe(false);
  });

  it("updateFixtureStatus flips status", async () => {
    const res = await updateFixtureStatus("comp-fixture-4", "completed");
    expect(res.success).toBe(true);
    const fx = await getFixture("comp-fixture-4");
    expect(fx!.status).toBe("completed");
  });

  it("cancelFixture stamps reason into notes", async () => {
    const res = await cancelFixture("comp-fixture-4", "Power cut");
    expect(res.success).toBe(true);
    const fx = await getFixture("comp-fixture-4");
    expect(fx!.status).toBe("cancelled");
    expect(fx!.notes).toBe("Power cut");
  });

  it("postponeFixture updates status + date", async () => {
    const res = await postponeFixture(
      "comp-fixture-4",
      "2026-04-15T19:00:00.000Z"
    );
    expect(res.success).toBe(true);
    const fx = await getFixture("comp-fixture-4");
    expect(fx!.status).toBe("postponed");
    expect(fx!.fixture_date).toBe("2026-04-15T19:00:00.000Z");
  });

  it("getFixturesEnriched returns submatches + results + lineups per fixture", async () => {
    const enriched = await getFixturesEnriched(LEAGUE);
    expect(enriched.length).toBe(4);
    const fx1 = enriched.find((e) => e.fixture.id === "comp-fixture-1")!;
    expect(fx1.subMatches.length).toBe(3);
    expect(fx1.results.length).toBe(3);
    expect(fx1.lineups.length).toBe(6);
  });
});
