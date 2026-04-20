import { describe, it, expect, beforeEach } from "vitest";
import {
  archiveGuest,
  createGuest,
  listGuests,
} from "@/competitions/data/guests";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("competitions guests data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("creates a staff-registered paying guest", async () => {
    const res = await createGuest({
      display_name: "Sam Paying",
      email: null,
      phone: null,
      is_paying: true,
      registered_by_member_id: null,
      registered_by_staff_id: "mock-staff-row-2",
      notes: null,
    });
    expect(res.success).toBe(true);
    const all = await listGuests({ activeOnly: true });
    expect(all.some((g) => g.id === res.id && g.is_paying)).toBe(true);
  });

  it("rejects a guest with both provenance ids set", async () => {
    const res = await createGuest({
      display_name: "Bad Guest",
      email: null,
      phone: null,
      is_paying: false,
      registered_by_member_id: "mock-member-row-1",
      registered_by_staff_id: "mock-staff-row-1",
      notes: null,
    });
    expect(res.success).toBe(false);
  });

  it("archiving hides the guest from activeOnly listings", async () => {
    const res = await archiveGuest("comp-guest-1");
    expect(res.success).toBe(true);
    const active = await listGuests({ activeOnly: true });
    expect(active.some((g) => g.id === "comp-guest-1")).toBe(false);
    const all = await listGuests({ activeOnly: false });
    expect(all.some((g) => g.id === "comp-guest-1")).toBe(true);
  });
});
