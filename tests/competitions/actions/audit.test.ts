import { describe, it, expect, beforeEach } from "vitest";
import { writeCompAuditLog } from "@/competitions/audit";

describe("competitions audit wrapper", () => {
  beforeEach(() => {
    /* nothing to reset — mock mode is a no-op */
  });

  it("is a no-op in mock mode (no throw)", async () => {
    await expect(
      writeCompAuditLog("comp.competition.created", "some-id", "actor-id", {
        hello: "world",
      })
    ).resolves.toBeUndefined();
  });

  it("accepts every comp.* event type on the union", async () => {
    // Type-level check: these calls compile only if the CompAuditEventType
    // union covers everything the spec enumerates. Runtime is trivial.
    await writeCompAuditLog("comp.competition.status_changed", "id", null, {});
    await writeCompAuditLog("comp.entrant.added", "id", null, {});
    await writeCompAuditLog("comp.match.result_recorded", "id", null, {});
    await writeCompAuditLog("comp.team.roster_added", "id", null, {});
    await writeCompAuditLog("comp.guest.created", "id", null, {});
    await writeCompAuditLog("comp.skill.updated", "id", null, {});
    expect(true).toBe(true);
  });
});
