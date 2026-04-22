import { describe, it, expect, beforeEach } from "vitest";
import {
  archiveSeasonAction,
  createSeasonAction,
  updateSeasonStatusAction,
} from "@/competitions/actions/seasons";
import { listSeasons } from "@/competitions/data/seasons";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

describe("season server actions", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("owner can create a season", async () => {
    signInAs("mock-owner-1");
    const res = await createSeasonAction({
      name: "Fall 2026",
      starts_at: "2026-09-01T00:00:00.000Z",
      ends_at: null,
    });
    expect(res.success).toBe(true);
  });

  it("manager cannot create a season", async () => {
    signInAs("mock-manager-1");
    const res = await createSeasonAction({
      name: "Fall 2026",
      starts_at: "2026-09-01T00:00:00.000Z",
      ends_at: null,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/owner/i);
  });

  it("anonymous cannot create a season", async () => {
    const res = await createSeasonAction({
      name: "Fall 2026",
      starts_at: "2026-09-01T00:00:00.000Z",
      ends_at: null,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/sign/i);
  });

  it("updateSeasonStatusAction flips status", async () => {
    signInAs("mock-owner-1");
    const seasons = await listSeasons();
    const planned = seasons.find((s) => s.status !== "archived")!;
    const res = await updateSeasonStatusAction(planned.id, "archived");
    expect(res.success).toBe(true);
  });

  it("archiveSeasonAction owner-only", async () => {
    signInAs("mock-member-1");
    const seasons = await listSeasons();
    const res = await archiveSeasonAction(seasons[0]!.id);
    expect(res.success).toBe(false);
  });
});
