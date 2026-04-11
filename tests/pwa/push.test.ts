import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  __resetMockPushSubscriptions,
  getSubscriptionsForMember,
  getSubscriptionsForMembers,
  isSubscribed,
  removeSubscription,
  saveSubscription,
} from "@/lib/data/push-subscriptions";
import { sendPushToMember, sendPushToMembers } from "@/lib/push/send";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MEMBER_A = "mock-member-row-1";
const MEMBER_B = "mock-member-row-2";

const SUB_A1 = {
  endpoint: "https://push.example/endpoint-a1",
  p256dh: "p256dh-a1",
  auth: "auth-a1",
};
const SUB_A2 = {
  endpoint: "https://push.example/endpoint-a2",
  p256dh: "p256dh-a2",
  auth: "auth-a2",
};
const SUB_B1 = {
  endpoint: "https://push.example/endpoint-b1",
  p256dh: "p256dh-b1",
  auth: "auth-b1",
};

describe("push subscriptions data layer (mock mode)", () => {
  beforeEach(() => {
    __resetMockPushSubscriptions();
  });

  describe("saveSubscription", () => {
    it("rejects a subscription with no owner", async () => {
      const result = await saveSubscription({
        endpoint: SUB_A1.endpoint,
        p256dh: SUB_A1.p256dh,
        auth: SUB_A1.auth,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/member or staff/);
    });

    it("rejects a subscription missing keys", async () => {
      const result = await saveSubscription({
        memberId: MEMBER_A,
        endpoint: "",
        p256dh: "",
        auth: "",
      });
      expect(result.success).toBe(false);
    });

    it("saves a new subscription", async () => {
      const result = await saveSubscription({
        memberId: MEMBER_A,
        ...SUB_A1,
        userAgent: "vitest",
      });
      expect(result.success).toBe(true);
      const rows = await getSubscriptionsForMember(MEMBER_A);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.endpoint).toBe(SUB_A1.endpoint);
      expect(rows[0]!.user_agent).toBe("vitest");
    });

    it("upserts (replaces) when the same endpoint is re-saved", async () => {
      await saveSubscription({ memberId: MEMBER_A, ...SUB_A1 });
      await saveSubscription({
        memberId: MEMBER_B,
        ...SUB_A1,
        userAgent: "reassigned",
      });

      const rowsA = await getSubscriptionsForMember(MEMBER_A);
      const rowsB = await getSubscriptionsForMember(MEMBER_B);
      expect(rowsA).toHaveLength(0);
      expect(rowsB).toHaveLength(1);
      expect(rowsB[0]!.user_agent).toBe("reassigned");
    });
  });

  describe("removeSubscription", () => {
    it("removes an existing subscription", async () => {
      await saveSubscription({ memberId: MEMBER_A, ...SUB_A1 });
      const removal = await removeSubscription(SUB_A1.endpoint);
      expect(removal.success).toBe(true);
      const rows = await getSubscriptionsForMember(MEMBER_A);
      expect(rows).toEqual([]);
    });

    it("is a no-op for an unknown endpoint", async () => {
      const removal = await removeSubscription("https://push.example/ghost");
      expect(removal.success).toBe(true);
    });
  });

  describe("getSubscriptionsForMembers", () => {
    it("batch-fetches across multiple members", async () => {
      await saveSubscription({ memberId: MEMBER_A, ...SUB_A1 });
      await saveSubscription({ memberId: MEMBER_A, ...SUB_A2 });
      await saveSubscription({ memberId: MEMBER_B, ...SUB_B1 });

      const rows = await getSubscriptionsForMembers([MEMBER_A, MEMBER_B]);
      expect(rows).toHaveLength(3);
      const endpoints = rows.map((r) => r.endpoint).sort();
      expect(endpoints).toEqual(
        [SUB_A1.endpoint, SUB_A2.endpoint, SUB_B1.endpoint].sort()
      );
    });

    it("returns empty for an empty input", async () => {
      const rows = await getSubscriptionsForMembers([]);
      expect(rows).toEqual([]);
    });
  });

  describe("isSubscribed", () => {
    it("returns false when nothing is stored", async () => {
      const result = await isSubscribed(MEMBER_A);
      expect(result).toBe(false);
    });

    it("returns true after saveSubscription", async () => {
      await saveSubscription({ memberId: MEMBER_A, ...SUB_A1 });
      expect(await isSubscribed(MEMBER_A)).toBe(true);
      expect(await isSubscribed(MEMBER_B)).toBe(false);
    });

    it("returns false when no owner ids are provided", async () => {
      expect(await isSubscribed()).toBe(false);
      expect(await isSubscribed(null, null)).toBe(false);
    });
  });
});

describe("push sender (mock mode)", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    __resetMockPushSubscriptions();
    logSpy.mockClear();
    warnSpy.mockClear();
    // VAPID keys are not configured in the test env, so the sender should
    // fall through to its mock branch (console.log and return).
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it("sendPushToMember does not throw and is a no-op with no subscriptions", async () => {
    await expect(
      sendPushToMember(MEMBER_A, { title: "Hi", body: "No subs" })
    ).resolves.toBeUndefined();
    // No subscriptions → sender exits before logging.
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("sendPushToMember logs the payload for a subscribed member without throwing", async () => {
    await saveSubscription({ memberId: MEMBER_A, ...SUB_A1 });

    await expect(
      sendPushToMember(MEMBER_A, {
        title: "Booking Confirmed",
        body: "Table 1 for 1h",
        url: "/bookings/test",
        tag: "booking-test",
      })
    ).resolves.toBeUndefined();

    // In mock mode the sender logs a "Would send to …" line.
    expect(logSpy).toHaveBeenCalled();
    const call = logSpy.mock.calls.find((c) =>
      String(c[0]).includes("[push/mock]")
    );
    expect(call).toBeDefined();
  });

  it("sendPushToMembers batches across multiple members", async () => {
    await saveSubscription({ memberId: MEMBER_A, ...SUB_A1 });
    await saveSubscription({ memberId: MEMBER_B, ...SUB_B1 });

    await expect(
      sendPushToMembers([MEMBER_A, MEMBER_B], {
        title: "Session Cancelled",
        body: "Someone's session was cancelled",
        url: "/bookings",
      })
    ).resolves.toBeUndefined();

    const call = logSpy.mock.calls.find((c) =>
      String(c[0]).includes("Would send to 2 subscription")
    );
    expect(call).toBeDefined();
  });

  it("sendPushToMembers is a cheap no-op for an empty list", async () => {
    await expect(
      sendPushToMembers([], { title: "x", body: "y" })
    ).resolves.toBeUndefined();
    expect(logSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Expired-subscription cleanup — simulates the 410 Gone path by mocking the
// web-push module directly. We re-import the sender after mocking so its
// module-level VAPID config can pick up the fake keys.
// ---------------------------------------------------------------------------
describe("push sender — expired subscription cleanup", () => {
  beforeEach(() => {
    __resetMockPushSubscriptions();
    vi.resetModules();
  });

  it("removes the subscription from the store when webpush returns 410", async () => {
    // Provide fake VAPID keys so the sender's configuration branch succeeds
    // inside the freshly-imported module.
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
      "BPfakepublickey_hJt8Y2qUvIKD0kCbVtT-0nY5qHbwqN3z1Z6yA3nJQyE";
    process.env.VAPID_PRIVATE_KEY = "fake-private-key";

    // Mock web-push so that setVapidDetails is a no-op and sendNotification
    // always rejects with a { statusCode: 410 } error.
    vi.doMock("web-push", () => ({
      default: {
        setVapidDetails: vi.fn(),
        sendNotification: vi.fn().mockRejectedValue({ statusCode: 410 }),
      },
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn().mockRejectedValue({ statusCode: 410 }),
    }));

    // Re-import the data layer and sender AFTER the mock is registered so
    // they both see the stubbed web-push module.
    const dataMod = await import("@/lib/data/push-subscriptions");
    const senderMod = await import("@/lib/push/send");

    dataMod.__resetMockPushSubscriptions();
    await dataMod.saveSubscription({
      memberId: MEMBER_A,
      endpoint: SUB_A1.endpoint,
      p256dh: SUB_A1.p256dh,
      auth: SUB_A1.auth,
    });
    expect(await dataMod.getSubscriptionsForMember(MEMBER_A)).toHaveLength(1);

    await senderMod.sendPushToMember(MEMBER_A, {
      title: "Should 410",
      body: "This should trigger cleanup",
    });

    // After the 410, the sender should have called removeSubscription, so
    // the store is empty again.
    expect(await dataMod.getSubscriptionsForMember(MEMBER_A)).toHaveLength(0);

    // Clean up so other tests don't observe fake keys.
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    vi.doUnmock("web-push");
  });
});
