import { describe, it, expect, beforeEach } from "vitest";
import {
  assignTier,
  createMember,
  getAllMembers,
  getAllTiers,
  getCurrentAuthUserId,
  getMemberById,
  getMemberDetailById,
  getMemberProfile,
  getMemberWithTier,
  linkStripeCustomer,
  searchMembers,
  setCredits,
  setSubscriptionStatus,
  updateMemberNotes,
  updateMemberProfile,
} from "@/lib/data/members";
import { MOCK_MEMBERS, findMockMemberById } from "@/lib/data/mock-data";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../stubs/next-headers";
import { resetMockData } from "../helpers/reset-mock-data";

const MONA_AUTH = "mock-member-1";
const MONA_ROW = "mock-member-row-1";
const PREMIUM_ROW = "mock-member-row-2";

describe("members data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  // ===========================================================================
  // Auth-user lookup
  // ===========================================================================
  describe("getCurrentAuthUserId", () => {
    it("returns null when no session cookie is set", async () => {
      expect(await getCurrentAuthUserId()).toBeNull();
    });

    it("returns the cookie value when the mock session is set", async () => {
      __setMockCookie(MOCK_SESSION_COOKIE, MONA_AUTH);
      expect(await getCurrentAuthUserId()).toBe(MONA_AUTH);
    });
  });

  // ===========================================================================
  // Profile lookup
  // ===========================================================================
  describe("getMemberProfile", () => {
    it("resolves a member by auth_user_id", async () => {
      const member = await getMemberProfile(MONA_AUTH);
      expect(member?.id).toBe(MONA_ROW);
    });

    it("returns null for an unknown auth_user_id", async () => {
      expect(await getMemberProfile("does-not-exist")).toBeNull();
    });
  });

  describe("getMemberWithTier", () => {
    it("returns the member plus their tier row", async () => {
      const res = await getMemberWithTier(MONA_AUTH);
      expect(res?.member.id).toBe(MONA_ROW);
      expect(res?.tier?.id).toBe("tier-standard");
    });

    it("returns null for an unknown auth_user_id", async () => {
      expect(await getMemberWithTier("does-not-exist")).toBeNull();
    });
  });

  describe("getMemberById", () => {
    it("resolves a member by primary key", async () => {
      expect((await getMemberById(MONA_ROW))?.id).toBe(MONA_ROW);
    });

    it("returns null for an unknown id", async () => {
      expect(await getMemberById("nope")).toBeNull();
    });
  });

  // ===========================================================================
  // Search (Fix 1 + Fix 10 — sanitisation + status filter)
  // ===========================================================================
  describe("searchMembers", () => {
    it("returns empty array for empty search term", async () => {
      expect(await searchMembers("", [])).toEqual([]);
      expect(await searchMembers("  ", [])).toEqual([]);
    });

    it("matches by partial name (case-insensitive)", async () => {
      const res = await searchMembers("mon", []);
      expect(res.some((m) => m.id === MONA_ROW)).toBe(true);
    });

    it("matches by email substring", async () => {
      const res = await searchMembers("alex@tigress", []);
      expect(res.some((m) => m.email.startsWith("alex"))).toBe(true);
    });

    it("excludes members in the excludeIds list", async () => {
      const res = await searchMembers("tigress", [MONA_ROW]);
      expect(res.every((m) => m.id !== MONA_ROW)).toBe(true);
    });

    it("excludes non-active members (Fix 10)", async () => {
      const mona = findMockMemberById(MONA_ROW)!;
      mona.status = "suspended";
      const res = await searchMembers("mon", []);
      expect(res.some((m) => m.id === MONA_ROW)).toBe(false);
    });

    it("caps results at 10", async () => {
      // Push many mock members to confirm the slice.
      for (let i = 0; i < 15; i++) {
        MOCK_MEMBERS.push({
          ...MOCK_MEMBERS[0]!,
          id: `extra-${i}`,
          auth_user_id: null,
          full_name: `Extra Zeta ${i}`,
          email: `extra${i}@tigress.test`,
        });
      }
      const res = await searchMembers("extra", []);
      expect(res.length).toBeLessThanOrEqual(10);
    });
  });

  // ===========================================================================
  // Staff-side listing
  // ===========================================================================
  describe("getAllMembers", () => {
    it("returns all mock members when no search term is given", async () => {
      const res = await getAllMembers();
      expect(res.length).toBe(MOCK_MEMBERS.length);
      expect(res[0]!.member.id).toBeDefined();
    });

    it("filters by a case-insensitive search term", async () => {
      const res = await getAllMembers("PRIYA");
      expect(res.length).toBe(1);
      expect(res[0]!.member.full_name).toBe("Priya Kumar");
    });

    it("returns an empty list when no match", async () => {
      const res = await getAllMembers("zzzzz-no-match");
      expect(res).toEqual([]);
    });
  });

  describe("getMemberDetailById", () => {
    it("returns member + tier + upcoming + past bookings", async () => {
      const detail = await getMemberDetailById(MONA_ROW);
      expect(detail).not.toBeNull();
      expect(detail?.member.id).toBe(MONA_ROW);
      expect(detail?.tier?.id).toBe("tier-standard");
      expect(detail?.upcomingBookings.length).toBeGreaterThan(0);
      expect(detail?.pastBookings.length).toBeGreaterThan(0);
    });

    it("returns null for an unknown id", async () => {
      expect(await getMemberDetailById("nope")).toBeNull();
    });
  });

  // ===========================================================================
  // Tiers list
  // ===========================================================================
  describe("getAllTiers", () => {
    it("returns all tiers", async () => {
      const tiers = await getAllTiers();
      expect(tiers.length).toBeGreaterThan(0);
      expect(tiers.some((t) => t.id === "tier-standard")).toBe(true);
      expect(tiers.some((t) => t.id === "tier-premium")).toBe(true);
    });
  });

  // ===========================================================================
  // Stripe linkage
  // ===========================================================================
  describe("linkStripeCustomer", () => {
    it("attaches a customer id to an existing member", async () => {
      const res = await linkStripeCustomer(MONA_ROW, "cus_abc123");
      expect(res.success).toBe(true);
      expect(findMockMemberById(MONA_ROW)?.stripe_customer_id).toBe(
        "cus_abc123"
      );
    });

    it("clears the linkage when passed null", async () => {
      await linkStripeCustomer(MONA_ROW, "cus_abc123");
      await linkStripeCustomer(MONA_ROW, null);
      expect(findMockMemberById(MONA_ROW)?.stripe_customer_id).toBeNull();
    });

    it("errors for an unknown member", async () => {
      const res = await linkStripeCustomer("not-a-member", "cus_abc123");
      expect(res.success).toBe(false);
    });
  });

  // ===========================================================================
  // Owner mutations: notes, tier, credits, subscription status
  // ===========================================================================
  describe("updateMemberNotes", () => {
    it("writes the notes field on the mock row", async () => {
      const res = await updateMemberNotes(MONA_ROW, "VIP - treat well");
      expect(res.success).toBe(true);
      expect(findMockMemberById(MONA_ROW)?.notes).toBe("VIP - treat well");
    });

    it("clears notes when an empty string is given", async () => {
      await updateMemberNotes(MONA_ROW, "first note");
      await updateMemberNotes(MONA_ROW, "");
      expect(findMockMemberById(MONA_ROW)?.notes).toBeNull();
    });

    it("errors for an unknown member", async () => {
      const res = await updateMemberNotes("nope", "x");
      expect(res.success).toBe(false);
    });
  });

  describe("assignTier", () => {
    it("assigns a tier and auto-activates a previously untiered member", async () => {
      const m = findMockMemberById(MONA_ROW)!;
      m.subscription_status = "none";
      m.membership_tier_id = null;
      m.credits_remaining = 0;

      const res = await assignTier(MONA_ROW, "tier-premium");
      expect(res.success).toBe(true);
      const after = findMockMemberById(MONA_ROW)!;
      expect(after.membership_tier_id).toBe("tier-premium");
      expect(after.subscription_status).toBe("active");
      // 10 credits from premium tier auto-grant
      expect(after.credits_remaining).toBe(10);
    });

    it("does NOT overwrite credits when the member already has some", async () => {
      const m = findMockMemberById(MONA_ROW)!;
      m.credits_remaining = 5;
      await assignTier(MONA_ROW, "tier-premium");
      expect(findMockMemberById(MONA_ROW)!.credits_remaining).toBe(5);
    });

    it("respects autoGrantCredits=false", async () => {
      const m = findMockMemberById(MONA_ROW)!;
      m.credits_remaining = 0;
      m.membership_tier_id = null;
      await assignTier(MONA_ROW, "tier-premium", false);
      expect(findMockMemberById(MONA_ROW)!.credits_remaining).toBe(0);
    });

    it("clears the tier when null is passed", async () => {
      await assignTier(MONA_ROW, null);
      expect(findMockMemberById(MONA_ROW)!.membership_tier_id).toBeNull();
    });

    it("errors for an unknown member", async () => {
      const res = await assignTier("nope", "tier-premium");
      expect(res.success).toBe(false);
    });
  });

  describe("setCredits", () => {
    it("overrides the member's credit balance", async () => {
      const res = await setCredits(MONA_ROW, 25);
      expect(res.success).toBe(true);
      expect(findMockMemberById(MONA_ROW)!.credits_remaining).toBe(25);
    });

    it("floors fractional values", async () => {
      await setCredits(MONA_ROW, 3.9);
      expect(findMockMemberById(MONA_ROW)!.credits_remaining).toBe(3);
    });

    it("rejects negative values", async () => {
      const res = await setCredits(MONA_ROW, -1);
      expect(res.success).toBe(false);
    });

    it("rejects NaN / Infinity", async () => {
      expect((await setCredits(MONA_ROW, Number.NaN)).success).toBe(false);
      expect((await setCredits(MONA_ROW, Infinity)).success).toBe(false);
    });
  });

  describe("setSubscriptionStatus", () => {
    it("updates the member's subscription status", async () => {
      const res = await setSubscriptionStatus(MONA_ROW, "past_due");
      expect(res.success).toBe(true);
      expect(findMockMemberById(MONA_ROW)!.subscription_status).toBe(
        "past_due"
      );
    });

    it("errors for an unknown member", async () => {
      const res = await setSubscriptionStatus("nope", "cancelled");
      expect(res.success).toBe(false);
    });
  });

  // ===========================================================================
  // createMember (mock)
  // ===========================================================================
  describe("createMember", () => {
    it("appends a new member row in mock mode", async () => {
      const before = MOCK_MEMBERS.length;
      const res = await createMember({
        full_name: "New Person",
        email: "new@tigress.test",
        phone: null,
        password: "password",
        membership_tier_id: "tier-standard",
        credits_remaining: 4,
        subscription_status: "active",
        notes: null,
      });
      expect(res.success).toBe(true);
      expect(res.memberId).toBeDefined();
      expect(MOCK_MEMBERS.length).toBe(before + 1);
      expect(findMockMemberById(res.memberId!)?.email).toBe("new@tigress.test");
    });
  });

  describe("updateMemberProfile", () => {
    it("updates full_name / phone / avatar_url in place", async () => {
      const res = await updateMemberProfile(MONA_ROW, {
        full_name: "Mona Renamed",
        phone: "+6588888888",
        avatar_url: "https://example.com/a.png",
      });
      expect(res.success).toBe(true);
      const after = findMockMemberById(MONA_ROW)!;
      expect(after.full_name).toBe("Mona Renamed");
      expect(after.phone).toBe("+6588888888");
      expect(after.avatar_url).toBe("https://example.com/a.png");
    });

    it("errors for an unknown member", async () => {
      const res = await updateMemberProfile("nope", {
        full_name: "x",
        phone: null,
        avatar_url: null,
      });
      expect(res.success).toBe(false);
    });
  });
});
