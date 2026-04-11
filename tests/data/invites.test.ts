import { describe, it, expect, beforeEach } from "vitest";
import {
  createInvite,
  getAllInvites,
  getPendingInvites,
  respondToInvite,
} from "@/lib/data/invites";
import {
  MOCK_BOOKINGS,
  MOCK_BOOKING_INVITES,
} from "@/lib/data/mock-data";
import { resetMockData } from "../helpers/reset-mock-data";

const MONA = "mock-member-row-1";
const ALEX = "mock-member-row-2";
const PRIYA = "mock-member-row-3";
const JORDAN = "mock-member-row-4";

describe("invites data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  // ===========================================================================
  // Listing
  // ===========================================================================
  describe("getPendingInvites", () => {
    it("returns only pending invites for the given invitee", async () => {
      const rows = await getPendingInvites(MONA);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.invite.invitee_id).toBe(MONA);
        expect(r.invite.status).toBe("pending");
      }
    });

    it("enriches with inviter/booking/table", async () => {
      const rows = await getPendingInvites(MONA);
      expect(rows[0]!.inviter).not.toBeNull();
      expect(rows[0]!.booking).not.toBeNull();
      expect(rows[0]!.table).not.toBeNull();
    });

    it("returns empty for a member with no invites", async () => {
      const rows = await getPendingInvites("ghost");
      expect(rows).toEqual([]);
    });
  });

  describe("getAllInvites", () => {
    it("includes accepted / declined rows as well as pending", async () => {
      const rows = await getAllInvites(MONA);
      const statuses = new Set(rows.map((r) => r.invite.status));
      expect(rows.length).toBeGreaterThan(0);
      expect(statuses.size).toBeGreaterThan(1);
    });
  });

  // ===========================================================================
  // createInvite
  // ===========================================================================
  describe("createInvite", () => {
    it("creates a pending invite from booking owner to invitee", async () => {
      // booking-2 belongs to Mona and has no invite to Alex yet.
      const res = await createInvite("booking-2", MONA, PRIYA);
      expect(res.success).toBe(true);
      expect(res.inviteId).toBeDefined();
      const row = MOCK_BOOKING_INVITES.find((i) => i.id === res.inviteId);
      expect(row?.status).toBe("pending");
      expect(row?.booking_id).toBe("booking-2");
      expect(row?.invitee_id).toBe(PRIYA);
    });

    it("rejects self-invite", async () => {
      const res = await createInvite("booking-1", MONA, MONA);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/yourself/i);
    });

    it("rejects invites from a non-owner", async () => {
      const res = await createInvite("booking-1", ALEX, JORDAN);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/only the booking owner/i);
    });

    it("rejects invites on a past booking", async () => {
      const res = await createInvite("booking-past-1", MONA, ALEX);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/past|only confirmed/i);
    });

    it("rejects invites on non-confirmed bookings", async () => {
      const res = await createInvite("booking-past-3", MONA, ALEX);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/confirmed|past/i);
    });

    it("rejects invites to unknown booking id", async () => {
      const res = await createInvite("nope", MONA, ALEX);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });

    it("rejects invites to unknown invitee id", async () => {
      const res = await createInvite("booking-2", MONA, "ghost");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });

    it("rejects duplicate invites (same booking + invitee)", async () => {
      // booking-1 already has Alex invited (accepted).
      const res = await createInvite("booking-1", MONA, ALEX);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already/i);
    });
  });

  // ===========================================================================
  // respondToInvite
  // ===========================================================================
  describe("respondToInvite", () => {
    it("lets the invitee accept their own invite", async () => {
      // invite-in-1 is for Mona, pending.
      const res = await respondToInvite("invite-in-1", MONA, "accepted");
      expect(res.success).toBe(true);
      const row = MOCK_BOOKING_INVITES.find((i) => i.id === "invite-in-1")!;
      expect(row.status).toBe("accepted");
    });

    it("lets the invitee decline", async () => {
      const res = await respondToInvite("invite-in-2", MONA, "declined");
      expect(res.success).toBe(true);
      const row = MOCK_BOOKING_INVITES.find((i) => i.id === "invite-in-2")!;
      expect(row.status).toBe("declined");
    });

    it("rejects response from a member who isn't the invitee", async () => {
      const res = await respondToInvite("invite-in-1", ALEX, "accepted");
      expect(res.success).toBe(false);
    });

    it("rejects unknown invite id", async () => {
      const res = await respondToInvite("nope", MONA, "accepted");
      expect(res.success).toBe(false);
    });
  });

  // Guard to ensure the bookings pinning the fixtures aren't mutated between
  // runs — if these assertions fail, resetMockData is broken.
  it("sanity: mock booking fixtures exist", () => {
    expect(MOCK_BOOKINGS.some((b) => b.id === "booking-1")).toBe(true);
    expect(MOCK_BOOKING_INVITES.length).toBeGreaterThan(0);
  });
});
