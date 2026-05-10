import { describe, expect, it } from "vitest";
import { buildPayslipDocument } from "@/scheduling/payroll/lib/payslip-transformer";
import { renderPayslipPdf } from "@/scheduling/payroll/lib/payslip-pdf";
import type {
  PayrollLineItem,
  PayrollRun,
  PayrollSettings,
  PayrollVenueBranding,
} from "@/scheduling/payroll/types";

// PDFs include non-deterministic CreationDate / ModDate metadata, so a
// byte-stream snapshot would be fragile across @react-pdf/renderer
// versions. The renderer is pinned in package.json (^4.x). These tests
// assert structural properties:
//   * the output is a valid PDF (PDF magic bytes %PDF-)
//   * the PDF is non-trivial in size
//   * the call doesn't throw on representative input
// String-content assertions (e.g. "Alice", "1295.00") would require text
// extraction since react-pdf compresses streams by default; we lean on
// the transformer tests for content correctness instead.

const FIXED_TS = "2025-01-01T00:00:00.000Z";

const RUN: PayrollRun = {
  id: "run-1",
  period_start: "2026-05-01",
  period_end: "2026-05-31",
  payment_date: "2026-06-07",
  status: "locked",
  locked_at: "2026-06-01T12:00:00Z",
  locked_by: "owner-1",
  unlocked_at: null,
  unlocked_by: null,
  unlock_note: null,
  last_computed_at: FIXED_TS,
  last_exported_at: null,
  last_export_format: null,
  created_at: FIXED_TS,
  updated_at: FIXED_TS,
};

const SETTINGS: Pick<PayrollSettings, "currency" | "timezone"> = {
  currency: "SGD",
  timezone: "Asia/Singapore",
};

const BRANDING: PayrollVenueBranding = {
  id: "brand-1",
  venue_name: "Tigress",
  address: "1 Cue St, Singapore",
  contact_email: "ops@tigress.test",
  contact_phone: "+65 0000 0000",
  logo_url: "",
  created_at: FIXED_TS,
  updated_at: FIXED_TS,
};

const STAFF = [
  { id: "u1", full_name: "Alice" },
  { id: "u2", full_name: "Bob" },
  { id: "owner-1", full_name: "Olivia Owner" },
];

function makeItem(
  partial: Partial<PayrollLineItem> & {
    id: string;
    staff_id: string;
    kind: PayrollLineItem["kind"];
    amount: number;
  }
): PayrollLineItem {
  return {
    id: partial.id,
    run_id: "run-1",
    staff_id: partial.staff_id,
    kind: partial.kind,
    label: partial.label ?? partial.kind,
    amount: partial.amount,
    hours: partial.hours ?? null,
    rate_applied: partial.rate_applied ?? null,
    multipliers: partial.multipliers ?? null,
    source: partial.source ?? "engine",
    clock_record_id: null,
    notes: null,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
  };
}

describe("renderPayslipPdf", () => {
  it("renders a single-staff payslip into a valid PDF buffer", async () => {
    const items: PayrollLineItem[] = [
      makeItem({ id: "1", staff_id: "u1", kind: "hours", amount: 800, hours: 40, rate_applied: 20 }),
      makeItem({ id: "2", staff_id: "u1", kind: "overtime", amount: 60, hours: 2, multipliers: { "ot:weekly_ot": 1.5 } }),
      makeItem({ id: "3", staff_id: "u1", kind: "deduction", amount: -25, source: "manual" }),
    ];
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: items,
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: { staffId: "owner-1", name: "Olivia Owner" },
      exportedAt: "2026-06-02T09:00:00.000Z",
    });
    const buf = await renderPayslipPdf(doc);
    expect(buf.length).toBeGreaterThan(1000);
    // Magic bytes for a PDF.
    expect(buf.slice(0, 5).toString("ascii")).toBe("%PDF-");
  }, 15000);

  it("renders a multi-staff payslip without throwing", async () => {
    const items: PayrollLineItem[] = [
      makeItem({ id: "1", staff_id: "u1", kind: "hours", amount: 800 }),
      makeItem({ id: "2", staff_id: "u2", kind: "hours", amount: 1000 }),
    ];
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: items,
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: { staffId: "owner-1", name: "Olivia Owner" },
      exportedAt: "2026-06-02T09:00:00.000Z",
    });
    const buf = await renderPayslipPdf(doc);
    expect(buf.slice(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
  }, 15000);

  it("renders an empty-staff payslip without throwing (no line items at all)", async () => {
    const doc = buildPayslipDocument({
      run: RUN,
      lineItems: [],
      staff: STAFF,
      venueBranding: BRANDING,
      settings: SETTINGS,
      exporter: { staffId: "owner-1", name: "Olivia Owner" },
      exportedAt: "2026-06-02T09:00:00.000Z",
    });
    // No staff section → react-pdf still emits a valid Document with zero
    // pages, which is acceptable; we don't dictate the byte size.
    const buf = await renderPayslipPdf(doc);
    expect(buf.slice(0, 5).toString("ascii")).toBe("%PDF-");
  }, 15000);
});
