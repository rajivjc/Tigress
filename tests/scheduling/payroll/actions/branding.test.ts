import { beforeEach, describe, expect, it } from "vitest";
import {
  getBrandingAction,
  updateBrandingAction,
} from "@/scheduling/payroll/actions/branding";
import {
  __resetMockPayroll,
  MOCK_PAYROLL_VENUE_BRANDING,
} from "@/scheduling/payroll/data/mock-data";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../../stubs/next-headers";
import { resetMockData } from "../../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

beforeEach(() => {
  resetMockData();
  __resetMockPayroll();
  signInAs(null);
});

describe("getBrandingAction", () => {
  it("rejects unauthenticated callers", async () => {
    const r = await getBrandingAction();
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not signed in/i);
  });

  it("rejects member callers (member auth doesn't resolve as staff)", async () => {
    signInAs("mock-member-1");
    const r = await getBrandingAction();
    expect(r.success).toBe(false);
    // Members aren't in the staff table, so getCurrentStaff returns null
    // and the action short-circuits at the auth gate.
    expect(r.error).toMatch(/not signed in/i);
  });

  it("staff can read branding", async () => {
    signInAs("mock-staff-1");
    const r = await getBrandingAction();
    expect(r.success).toBe(true);
    expect(r.branding?.venue_name).toBe("Tigress");
  });

  it("manager can read branding", async () => {
    signInAs("mock-manager-1");
    const r = await getBrandingAction();
    expect(r.success).toBe(true);
  });

  it("owner can read branding", async () => {
    signInAs("mock-owner-1");
    const r = await getBrandingAction();
    expect(r.success).toBe(true);
  });
});

describe("updateBrandingAction owner-only", () => {
  it("rejects unauthenticated callers", async () => {
    const r = await updateBrandingAction({ venueName: "x" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not signed in/i);
  });

  it("rejects staff callers", async () => {
    signInAs("mock-staff-1");
    const r = await updateBrandingAction({ venueName: "x" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });

  it("rejects manager callers", async () => {
    signInAs("mock-manager-1");
    const r = await updateBrandingAction({ venueName: "x" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });

  it("owner can update partial fields", async () => {
    signInAs("mock-owner-1");
    const r = await updateBrandingAction({
      venueName: "Tigress Billiards",
      contactEmail: "ops@tigress.test",
    });
    expect(r.success).toBe(true);
    expect(MOCK_PAYROLL_VENUE_BRANDING[0].venue_name).toBe("Tigress Billiards");
    expect(MOCK_PAYROLL_VENUE_BRANDING[0].contact_email).toBe(
      "ops@tigress.test"
    );
  });

  it("owner update doesn't affect omitted fields", async () => {
    signInAs("mock-owner-1");
    await updateBrandingAction({ venueName: "First" });
    await updateBrandingAction({ logoUrl: "https://logo.test/x.png" });
    expect(MOCK_PAYROLL_VENUE_BRANDING[0].venue_name).toBe("First");
    expect(MOCK_PAYROLL_VENUE_BRANDING[0].logo_url).toBe(
      "https://logo.test/x.png"
    );
  });
});
