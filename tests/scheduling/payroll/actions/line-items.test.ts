import { beforeEach, describe, expect, it } from "vitest";
import {
  addLineItemAction,
  deleteLineItemAction,
  updateLineItemAction,
} from "@/scheduling/payroll/actions/line-items";
import {
  attestRunForReviewAction,
  createRunAction,
  lockRunAction,
} from "@/scheduling/payroll/actions/runs";
import { __resetMockPayroll } from "@/scheduling/payroll/data/mock-data";
import {
  addLineItem,
  listLineItemsForRun,
} from "@/scheduling/payroll/data/line-items";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../../stubs/next-headers";
import { resetMockData } from "../../../helpers/reset-mock-data";
import type { PayrollLineItemKind } from "@/scheduling/payroll/types";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

async function createDraftRun(): Promise<string> {
  signInAs("mock-manager-1");
  const r = await createRunAction({
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
  });
  expect(r.success).toBe(true);
  return r.runId!;
}

async function createReviewRun(): Promise<string> {
  const id = await createDraftRun();
  signInAs("mock-manager-1");
  await attestRunForReviewAction(id);
  return id;
}

async function createLockedRun(): Promise<string> {
  const id = await createReviewRun();
  signInAs("mock-owner-1");
  await lockRunAction(id);
  return id;
}

beforeEach(() => {
  resetMockData();
  __resetMockPayroll();
  signInAs(null);
});

describe("addLineItemAction", () => {
  it("rejects staff", async () => {
    const runId = await createDraftRun();
    signInAs("mock-staff-1");
    const r = await addLineItemAction({
      runId,
      staffId: "mock-staff-row-1",
      kind: "tip",
      label: "Tip",
      amount: 10,
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/manager or owner/i);
  });

  it("manager can add a manual line item to a draft", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    const r = await addLineItemAction({
      runId,
      staffId: "mock-staff-row-1",
      kind: "tip",
      label: "Friday tips",
      amount: 25,
    });
    expect(r.success).toBe(true);
    const items = await listLineItemsForRun(runId);
    expect(items.find((i) => i.kind === "tip")?.label).toBe("Friday tips");
  });

  it("owner can add a manual line item", async () => {
    const runId = await createDraftRun();
    signInAs("mock-owner-1");
    const r = await addLineItemAction({
      runId,
      staffId: "mock-staff-row-1",
      kind: "allowance",
      label: "Transport",
      amount: 12,
    });
    expect(r.success).toBe(true);
  });

  it("rejects engine kinds (e.g. hours, overtime, statutory)", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    for (const kind of ["hours", "overtime", "rest_day", "public_holiday", "statutory"] as const) {
      const r = await addLineItemAction({
        runId,
        staffId: "mock-staff-row-1",
        kind,
        label: "shouldn't take",
        amount: 1,
      });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/manual kinds/i);
    }
  });

  it("rejects on review-status run", async () => {
    const runId = await createReviewRun();
    signInAs("mock-manager-1");
    const r = await addLineItemAction({
      runId,
      staffId: "mock-staff-row-1",
      kind: "tip",
      label: "x",
      amount: 1,
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/draft to edit/i);
  });

  it("rejects on locked-status run", async () => {
    const runId = await createLockedRun();
    signInAs("mock-manager-1");
    const r = await addLineItemAction({
      runId,
      staffId: "mock-staff-row-1",
      kind: "tip",
      label: "x",
      amount: 1,
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/draft to edit/i);
  });

  it("rejects empty label", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    const r = await addLineItemAction({
      runId,
      staffId: "mock-staff-row-1",
      kind: "tip",
      label: "   ",
      amount: 1,
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/label is required/i);
  });

  it("accepts each of the 5 manual kinds", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    const manualKinds: PayrollLineItemKind[] = [
      "allowance",
      "tip",
      "bonus",
      "deduction",
      "other",
    ];
    for (const kind of manualKinds) {
      const r = await addLineItemAction({
        runId,
        staffId: "mock-staff-row-1",
        kind,
        label: kind,
        amount: 5,
      });
      expect(r.success).toBe(true);
    }
  });
});

describe("updateLineItemAction", () => {
  async function seedManual(runId: string): Promise<string> {
    const created = await addLineItem({
      runId,
      staffId: "mock-staff-row-1",
      kind: "tip",
      label: "Original",
      amount: 10,
      source: "manual",
      notes: null,
    });
    return created.item!.id;
  }

  it("rejects staff", async () => {
    const runId = await createDraftRun();
    const itemId = await seedManual(runId);
    signInAs("mock-staff-1");
    const r = await updateLineItemAction({ id: itemId, label: "x" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/manager or owner/i);
  });

  it("manager can edit a manual item on a draft", async () => {
    const runId = await createDraftRun();
    const itemId = await seedManual(runId);
    signInAs("mock-manager-1");
    const r = await updateLineItemAction({ id: itemId, label: "Renamed", amount: 15 });
    expect(r.success).toBe(true);
    const items = await listLineItemsForRun(runId);
    expect(items.find((i) => i.id === itemId)?.label).toBe("Renamed");
    expect(items.find((i) => i.id === itemId)?.amount).toBe(15);
  });

  it("rejects engine items with the specific error", async () => {
    const runId = await createDraftRun();
    // Engine items are seeded by createRunAction's auto-recompute for the
    // mock staff. Find one and try to update.
    const engineItems = (await listLineItemsForRun(runId)).filter(
      (i) => i.source === "engine"
    );
    // If the engine produced no items (no clock records seeded), seed one.
    let target = engineItems[0];
    if (!target) {
      const created = await addLineItem({
        runId,
        staffId: "mock-staff-row-1",
        kind: "hours",
        label: "engine seed",
        amount: 1,
        source: "engine",
        notes: null,
      });
      target = created.item!;
    }
    signInAs("mock-manager-1");
    const r = await updateLineItemAction({ id: target.id, label: "x" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/only manual/i);
  });

  it("rejects when run is in review", async () => {
    const runId = await createDraftRun();
    const itemId = await seedManual(runId);
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    const r = await updateLineItemAction({ id: itemId, label: "x" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/draft to edit/i);
  });
});

describe("deleteLineItemAction", () => {
  async function seedManual(runId: string): Promise<string> {
    const created = await addLineItem({
      runId,
      staffId: "mock-staff-row-1",
      kind: "tip",
      label: "Original",
      amount: 10,
      source: "manual",
      notes: null,
    });
    return created.item!.id;
  }

  it("rejects staff", async () => {
    const runId = await createDraftRun();
    const itemId = await seedManual(runId);
    signInAs("mock-staff-1");
    const r = await deleteLineItemAction(itemId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/manager or owner/i);
  });

  it("manager can delete a manual item on draft", async () => {
    const runId = await createDraftRun();
    const itemId = await seedManual(runId);
    signInAs("mock-manager-1");
    const r = await deleteLineItemAction(itemId);
    expect(r.success).toBe(true);
    const items = await listLineItemsForRun(runId);
    expect(items.find((i) => i.id === itemId)).toBeUndefined();
  });

  it("rejects engine items", async () => {
    const runId = await createDraftRun();
    const created = await addLineItem({
      runId,
      staffId: "mock-staff-row-1",
      kind: "hours",
      label: "engine seed",
      amount: 1,
      source: "engine",
      notes: null,
    });
    signInAs("mock-manager-1");
    const r = await deleteLineItemAction(created.item!.id);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/only manual/i);
  });

  it("rejects when run is locked", async () => {
    const runId = await createDraftRun();
    const itemId = await seedManual(runId);
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    signInAs("mock-owner-1");
    await lockRunAction(runId);
    signInAs("mock-manager-1");
    const r = await deleteLineItemAction(itemId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/draft to edit/i);
  });
});
