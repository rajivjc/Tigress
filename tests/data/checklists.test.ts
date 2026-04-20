import { describe, it, expect, beforeEach } from "vitest";
import {
  createChecklistTemplate,
  deleteChecklistTemplate,
  getChecklistHistory,
  getChecklistInstanceItems,
  getChecklistTemplate,
  getChecklistTemplates,
  getChecklistsForDate,
  toggleChecklistItem,
  updateChecklistTemplate,
  updateChecklistTemplateItems,
} from "@/lib/data/checklists";
import {
  MOCK_CHECKLIST_INSTANCES,
  MOCK_CHECKLIST_INSTANCE_ITEMS,
  MOCK_CHECKLIST_TEMPLATES,
  MOCK_CHECKLIST_TEMPLATE_ITEMS,
} from "@/lib/data/mock-data";
import { resetMockData } from "../helpers/reset-mock-data";

const STAFF_ID = "mock-staff-row-1";
const MANAGER_ID = "mock-staff-row-2";

describe("checklist data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  // ===========================================================================
  // Templates
  // ===========================================================================
  describe("templates", () => {
    it("seeded templates are returned ordered by sort_order", async () => {
      const result = await getChecklistTemplates();
      expect(result.length).toBe(3);
      expect(result[0]!.template.name).toBe("Opening Procedures");
      expect(result[1]!.template.name).toBe("Closing Procedures");
      expect(result[2]!.template.name).toBe("Weekly Deep Clean");
    });

    it("getChecklistTemplate returns a single template with items", async () => {
      const result = await getChecklistTemplate(
        "checklist-template-opening"
      );
      expect(result).not.toBeNull();
      expect(result!.template.name).toBe("Opening Procedures");
      expect(result!.items.length).toBeGreaterThan(0);
      // Items are ordered
      for (let i = 1; i < result!.items.length; i++) {
        expect(result!.items[i]!.sort_order).toBeGreaterThanOrEqual(
          result!.items[i - 1]!.sort_order
        );
      }
    });

    it("returns null for unknown template id", async () => {
      const result = await getChecklistTemplate("does-not-exist");
      expect(result).toBeNull();
    });

    it("createChecklistTemplate stores the template + items", async () => {
      const before = MOCK_CHECKLIST_TEMPLATES.length;
      const res = await createChecklistTemplate({
        name: "Shift Handover",
        description: "End-of-shift handover checks",
        category: "ad_hoc",
        items: [
          { label: "Brief incoming staff", description: null },
          { label: "Log any incidents" },
        ],
        createdBy: MANAGER_ID,
      });
      expect(res.success).toBe(true);
      expect(res.templateId).toBeTruthy();
      expect(MOCK_CHECKLIST_TEMPLATES.length).toBe(before + 1);

      const storedItems = MOCK_CHECKLIST_TEMPLATE_ITEMS.filter(
        (i) => i.template_id === res.templateId
      );
      expect(storedItems.length).toBe(2);
      expect(storedItems[0]!.sort_order).toBe(1);
      expect(storedItems[1]!.sort_order).toBe(2);
    });

    it("createChecklistTemplate rejects blank name", async () => {
      const res = await createChecklistTemplate({
        name: "   ",
        category: "daily",
        items: [{ label: "x" }],
        createdBy: MANAGER_ID,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/name/i);
    });

    it("updateChecklistTemplate updates metadata only", async () => {
      const templateId = "checklist-template-opening";
      const res = await updateChecklistTemplate(templateId, {
        name: "Morning Setup",
        category: "weekly",
      });
      expect(res.success).toBe(true);
      const stored = MOCK_CHECKLIST_TEMPLATES.find(
        (t) => t.id === templateId
      );
      expect(stored!.name).toBe("Morning Setup");
      expect(stored!.category).toBe("weekly");
    });

    it("updateChecklistTemplateItems replaces existing items", async () => {
      const templateId = "checklist-template-opening";
      const existingItems = MOCK_CHECKLIST_TEMPLATE_ITEMS.filter(
        (i) => i.template_id === templateId
      );
      expect(existingItems.length).toBeGreaterThan(2);

      // Keep only the first item, rename it, and add a new one.
      const firstId = existingItems[0]!.id;
      const res = await updateChecklistTemplateItems(templateId, [
        {
          id: firstId,
          label: "Renamed first step",
          sort_order: 1,
        },
        {
          label: "Brand new step",
          sort_order: 2,
        },
      ]);
      expect(res.success).toBe(true);

      const afterItems = MOCK_CHECKLIST_TEMPLATE_ITEMS.filter(
        (i) => i.template_id === templateId
      );
      expect(afterItems.length).toBe(2);
      expect(afterItems.find((i) => i.id === firstId)!.label).toBe(
        "Renamed first step"
      );
      expect(afterItems.some((i) => i.label === "Brand new step")).toBe(
        true
      );
    });

    it("deleteChecklistTemplate soft-deletes (sets is_active=false)", async () => {
      const templateId = "checklist-template-opening";
      const res = await deleteChecklistTemplate(templateId);
      expect(res.success).toBe(true);
      const stored = MOCK_CHECKLIST_TEMPLATES.find(
        (t) => t.id === templateId
      );
      expect(stored!.is_active).toBe(false);
    });

    it("soft-deleted templates are excluded from lazy instance creation", async () => {
      await deleteChecklistTemplate("checklist-template-opening");
      const checklists = await getChecklistsForDate("2026-04-20");
      expect(
        checklists.some((c) => c.template.id === "checklist-template-opening")
      ).toBe(false);
      // The other active templates still generate instances.
      expect(checklists.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Lazy instance creation
  // ===========================================================================
  describe("getChecklistsForDate (lazy creation)", () => {
    it("creates instances on first access for a date", async () => {
      expect(MOCK_CHECKLIST_INSTANCES.length).toBe(0);
      const checklists = await getChecklistsForDate("2026-04-20");
      const activeTemplateCount = MOCK_CHECKLIST_TEMPLATES.filter(
        (t) => t.is_active
      ).length;
      expect(checklists.length).toBe(activeTemplateCount);
      expect(MOCK_CHECKLIST_INSTANCES.length).toBe(activeTemplateCount);

      // Each instance has the right items copied from its template.
      for (const group of checklists) {
        const templateItems = MOCK_CHECKLIST_TEMPLATE_ITEMS.filter(
          (i) => i.template_id === group.instance.template_id
        );
        expect(group.items.length).toBe(templateItems.length);
        // Labels are copied verbatim
        for (const item of group.items) {
          expect(item.checked).toBe(false);
          const sourceLabels = templateItems.map((t) => t.label);
          expect(sourceLabels).toContain(item.label);
        }
      }
    });

    it("does not duplicate instances on a second call for the same date", async () => {
      await getChecklistsForDate("2026-04-20");
      const firstCount = MOCK_CHECKLIST_INSTANCES.length;
      const firstItemCount = MOCK_CHECKLIST_INSTANCE_ITEMS.length;
      await getChecklistsForDate("2026-04-20");
      expect(MOCK_CHECKLIST_INSTANCES.length).toBe(firstCount);
      expect(MOCK_CHECKLIST_INSTANCE_ITEMS.length).toBe(firstItemCount);
    });

    it("excludes inactive templates from new instances", async () => {
      await updateChecklistTemplate("checklist-template-weekly-clean", {
        is_active: false,
      });
      const checklists = await getChecklistsForDate("2026-04-21");
      expect(
        checklists.some(
          (c) => c.template.id === "checklist-template-weekly-clean"
        )
      ).toBe(false);
    });

    it("items in the instance copy both label and description from template", async () => {
      const checklists = await getChecklistsForDate("2026-04-20");
      const opening = checklists.find(
        (c) => c.template.id === "checklist-template-opening"
      );
      expect(opening).toBeTruthy();
      const firstItem = opening!.items[0]!;
      const sourceItem = MOCK_CHECKLIST_TEMPLATE_ITEMS.find(
        (t) => t.id === firstItem.template_item_id
      );
      expect(sourceItem).toBeTruthy();
      expect(firstItem.label).toBe(sourceItem!.label);
      expect(firstItem.description).toBe(sourceItem!.description);
    });
  });

  // ===========================================================================
  // Toggle
  // ===========================================================================
  describe("toggleChecklistItem", () => {
    it("checks an item — stamps checked_by and checked_at", async () => {
      const checklists = await getChecklistsForDate("2026-04-22");
      const item = checklists[0]!.items[0]!;
      const res = await toggleChecklistItem(item.id, STAFF_ID);
      expect(res.success).toBe(true);
      expect(res.checked).toBe(true);

      const stored = MOCK_CHECKLIST_INSTANCE_ITEMS.find(
        (i) => i.id === item.id
      );
      expect(stored!.checked).toBe(true);
      expect(stored!.checked_by).toBe(STAFF_ID);
      expect(stored!.checked_at).not.toBeNull();
    });

    it("unchecks an item — clears checked_by and checked_at", async () => {
      const checklists = await getChecklistsForDate("2026-04-23");
      const item = checklists[0]!.items[0]!;
      await toggleChecklistItem(item.id, STAFF_ID);
      const res = await toggleChecklistItem(item.id, STAFF_ID);
      expect(res.success).toBe(true);
      expect(res.checked).toBe(false);

      const stored = MOCK_CHECKLIST_INSTANCE_ITEMS.find(
        (i) => i.id === item.id
      );
      expect(stored!.checked).toBe(false);
      expect(stored!.checked_by).toBeNull();
      expect(stored!.checked_at).toBeNull();
    });

    it("stamps the instance as complete when the last item is checked", async () => {
      const checklists = await getChecklistsForDate("2026-04-24");
      const group = checklists[0]!;
      let lastResult;
      for (const item of group.items) {
        lastResult = await toggleChecklistItem(item.id, STAFF_ID);
      }
      expect(lastResult!.allComplete).toBe(true);
      const instance = MOCK_CHECKLIST_INSTANCES.find(
        (i) => i.id === group.instance.id
      );
      expect(instance!.completed_at).not.toBeNull();
      expect(instance!.completed_by).toBe(STAFF_ID);
    });

    it("clears completion when an item on a completed instance is unchecked", async () => {
      const checklists = await getChecklistsForDate("2026-04-25");
      const group = checklists[0]!;
      for (const item of group.items) {
        await toggleChecklistItem(item.id, STAFF_ID);
      }
      const instance = MOCK_CHECKLIST_INSTANCES.find(
        (i) => i.id === group.instance.id
      );
      expect(instance!.completed_at).not.toBeNull();

      // Uncheck one — completion should clear.
      const res = await toggleChecklistItem(
        group.items[0]!.id,
        STAFF_ID
      );
      expect(res.allComplete).toBe(false);
      expect(instance!.completed_at).toBeNull();
      expect(instance!.completed_by).toBeNull();
    });

    it("returns an error for an unknown item id", async () => {
      const res = await toggleChecklistItem("does-not-exist", STAFF_ID);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });
  });

  // ===========================================================================
  // History
  // ===========================================================================
  describe("getChecklistHistory", () => {
    it("returns instances within the date range", async () => {
      await getChecklistsForDate("2026-04-20");
      await getChecklistsForDate("2026-04-21");
      await getChecklistsForDate("2026-04-22");

      const rows = await getChecklistHistory({
        startDate: "2026-04-20",
        endDate: "2026-04-21",
      });
      const dates = [...new Set(rows.map((r) => r.date))];
      expect(dates.sort()).toEqual(["2026-04-20", "2026-04-21"]);
    });

    it("filters by templateId when specified", async () => {
      await getChecklistsForDate("2026-04-20");
      await getChecklistsForDate("2026-04-21");

      const rows = await getChecklistHistory({
        startDate: "2026-04-20",
        endDate: "2026-04-21",
        templateId: "checklist-template-opening",
      });
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.template_id).toBe("checklist-template-opening");
      }
    });

    it("reports correct completion counts", async () => {
      const checklists = await getChecklistsForDate("2026-04-20");
      const opening = checklists.find(
        (c) => c.template.id === "checklist-template-opening"
      )!;

      // Check two items
      await toggleChecklistItem(opening.items[0]!.id, STAFF_ID);
      await toggleChecklistItem(opening.items[1]!.id, STAFF_ID);

      const rows = await getChecklistHistory({
        startDate: "2026-04-20",
        endDate: "2026-04-20",
        templateId: "checklist-template-opening",
      });
      const row = rows[0]!;
      expect(row.items_total).toBe(opening.items.length);
      expect(row.items_checked).toBe(2);
      expect(row.completed_at).toBeNull();
    });
  });

  // ===========================================================================
  // Single-instance detail fetch
  // ===========================================================================
  describe("getChecklistInstanceItems", () => {
    it("returns items for a given instance, ordered by sort_order", async () => {
      const checklists = await getChecklistsForDate("2026-04-26");
      const instance = checklists[0]!.instance;
      const items = await getChecklistInstanceItems(instance.id);
      expect(items.length).toBeGreaterThan(0);
      for (let i = 1; i < items.length; i++) {
        expect(items[i]!.sort_order).toBeGreaterThanOrEqual(
          items[i - 1]!.sort_order
        );
      }
    });
  });
});
