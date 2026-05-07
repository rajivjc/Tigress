import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteShiftTemplate,
  getShiftTemplate,
  listDayCoverage,
  listShiftTemplates,
  removeTemplateDayCoverage,
  setTemplateDayCoverage,
  upsertShiftTemplate,
} from "@/scheduling/data/templates";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("scheduling templates data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("seeds the AM/PM/Closer templates sorted by sort_order", async () => {
    const templates = await listShiftTemplates();
    expect(templates.map((t) => t.name)).toEqual(["AM", "PM", "Closer"]);
  });

  it("creates a new template", async () => {
    const r = await upsertShiftTemplate({
      name: "Brunch",
      start_time: "09:00:00",
      end_time: "13:00:00",
    });
    expect(r.success).toBe(true);
    const fetched = await getShiftTemplate(r.templateId!);
    expect(fetched?.name).toBe("Brunch");
  });

  it("updates an existing template", async () => {
    const r = await upsertShiftTemplate({
      id: "schedule-template-am",
      name: "Morning",
      start_time: "11:00:00",
      end_time: "17:00:00",
    });
    expect(r.success).toBe(true);
    const fetched = await getShiftTemplate("schedule-template-am");
    expect(fetched?.name).toBe("Morning");
    expect(fetched?.start_time).toBe("11:00:00");
  });

  it("rejects empty name", async () => {
    const r = await upsertShiftTemplate({
      name: "",
      start_time: "09:00:00",
      end_time: "12:00:00",
    });
    expect(r.success).toBe(false);
  });

  it("soft-deletes via is_active=false", async () => {
    const r = await deleteShiftTemplate("schedule-template-am");
    expect(r.success).toBe(true);
    const fetched = await getShiftTemplate("schedule-template-am");
    expect(fetched?.is_active).toBe(false);
  });

  it("upserts day coverage and reads it back", async () => {
    const r = await setTemplateDayCoverage("schedule-template-am", 0, {
      bartender: 2,
    });
    expect(r.success).toBe(true);
    const all = await listDayCoverage();
    const row = all.find(
      (c) =>
        c.template_id === "schedule-template-am" && c.day_of_week === 0
    );
    expect(row?.role_requirements.bartender).toBe(2);
  });

  it("strips zero entries from role requirements", async () => {
    await setTemplateDayCoverage("schedule-template-am", 0, {
      bartender: 0,
      floor: 1,
    });
    const all = await listDayCoverage();
    const row = all.find(
      (c) =>
        c.template_id === "schedule-template-am" && c.day_of_week === 0
    );
    expect(row?.role_requirements).toEqual({ floor: 1 });
  });

  it("removes a coverage row", async () => {
    await setTemplateDayCoverage("schedule-template-am", 0, { bartender: 1 });
    const r = await removeTemplateDayCoverage("schedule-template-am", 0);
    expect(r.success).toBe(true);
    const all = await listDayCoverage();
    const row = all.find(
      (c) =>
        c.template_id === "schedule-template-am" && c.day_of_week === 0
    );
    expect(row).toBeUndefined();
  });
});
