import { beforeEach, describe, expect, it } from "vitest";
import { __resetMockPayroll } from "@/scheduling/payroll/data/mock-data";
import { getBranding, updateBranding } from "@/scheduling/payroll/data/branding";

beforeEach(() => {
  __resetMockPayroll();
});

describe("payroll venue branding (mock mode)", () => {
  it("returns the singleton row from the seed", async () => {
    const branding = await getBranding();
    expect(branding).not.toBeNull();
    expect(branding?.venue_name).toBe("Tigress");
  });

  it("updateBranding writes the partial fields", async () => {
    const updated = await updateBranding({
      venue_name: "New Venue",
      address: "42 Cue Lane",
      contact_email: "hello@new.test",
    });
    expect(updated?.venue_name).toBe("New Venue");
    expect(updated?.address).toBe("42 Cue Lane");
    expect(updated?.contact_email).toBe("hello@new.test");
    expect(updated?.contact_phone).toBe("");
    expect(updated?.logo_url).toBe("");
  });

  it("updateBranding leaves omitted fields untouched", async () => {
    await updateBranding({ venue_name: "First" });
    const after = await updateBranding({ contact_email: "x@y.z" });
    expect(after?.venue_name).toBe("First");
    expect(after?.contact_email).toBe("x@y.z");
  });

  it("getBranding always reads the same singleton (no second row)", async () => {
    await updateBranding({ venue_name: "A" });
    await updateBranding({ venue_name: "B" });
    const branding = await getBranding();
    expect(branding?.venue_name).toBe("B");
  });

  it("__resetMockPayroll restores the branding seed", async () => {
    await updateBranding({ venue_name: "Changed" });
    __resetMockPayroll();
    const branding = await getBranding();
    expect(branding?.venue_name).toBe("Tigress");
  });
});
