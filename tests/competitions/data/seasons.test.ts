import { describe, it, expect, beforeEach } from "vitest";
import {
  archiveSeason,
  createSeason,
  getSeason,
  listSeasons,
  updateSeasonStatus,
} from "@/competitions/data/seasons";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("seasons data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("seeds one active and one completed season", async () => {
    const seasons = await listSeasons();
    expect(seasons.length).toBe(2);
    expect(seasons.some((s) => s.status === "active")).toBe(true);
    expect(seasons.some((s) => s.status === "completed")).toBe(true);
  });

  it("filters by status", async () => {
    const active = await listSeasons({ status: "active" });
    expect(active.length).toBe(1);
    expect(active[0]!.status).toBe("active");
  });

  it("creates a new season", async () => {
    const res = await createSeason({
      name: "Summer 2026",
      starts_at: "2026-07-01T00:00:00.000Z",
      ends_at: null,
    });
    expect(res.success).toBe(true);
    const row = await getSeason(res.id!);
    expect(row!.name).toBe("Summer 2026");
    expect(row!.status).toBe("planned");
  });

  it("rejects an empty name", async () => {
    const res = await createSeason({
      name: "",
      starts_at: "2026-07-01T00:00:00.000Z",
      ends_at: null,
    });
    expect(res.success).toBe(false);
  });

  it("updates status", async () => {
    const res = await createSeason({
      name: "Test season",
      starts_at: "2026-07-01T00:00:00.000Z",
      ends_at: null,
    });
    await updateSeasonStatus(res.id!, "active");
    const row = await getSeason(res.id!);
    expect(row!.status).toBe("active");
  });

  it("archiveSeason flips status to archived", async () => {
    const res = await createSeason({
      name: "Test season",
      starts_at: "2026-07-01T00:00:00.000Z",
      ends_at: null,
    });
    await archiveSeason(res.id!);
    const row = await getSeason(res.id!);
    expect(row!.status).toBe("archived");
  });
});
