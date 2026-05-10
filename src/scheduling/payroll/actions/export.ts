"use server";

import JSZip from "jszip";
import { getCurrentStaff, listAllStaff } from "@/lib/data/staff";
import { writePayrollAuditLog } from "../audit";
import { getBranding } from "../data/branding";
import { listLineItemsForRun } from "../data/line-items";
import { getRun, setRunExported } from "../data/runs";
import { getSettings } from "../data/settings";
import { formatRunAsCsv } from "../lib/csv";
import {
  buildPayslipDocument,
  filterPayslipToStaff,
  type BuildPayslipDocumentInput,
  type PayslipDocument,
} from "../lib/payslip-transformer";
import { renderPayslipPdf } from "../lib/payslip-pdf";

function isManager(role: string): boolean {
  return role === "manager" || role === "owner";
}

function isStaff(role: string): boolean {
  return role === "staff" || role === "manager" || role === "owner";
}

interface ExportContext {
  current: NonNullable<Awaited<ReturnType<typeof getCurrentStaff>>>;
  buildInput: BuildPayslipDocumentInput;
  filenameBase: string;
}

/**
 * Shared resolver: loads the run, line items, staff, branding, settings,
 * and the exporter's identity, then assembles the input shape every
 * exporter consumes. Returns null with an error string when authz or
 * data-loading fails.
 */
async function loadExportContext(
  runId: string,
  options: { lockedOnly: boolean }
): Promise<{ ctx?: ExportContext; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { error: "Not signed in" };
  if (!isManager(current.role)) {
    return { error: "Manager or owner role required" };
  }

  const run = await getRun(runId);
  if (!run) return { error: "Run not found" };
  if (options.lockedOnly && run.status !== "locked") {
    return { error: "Run must be locked to export" };
  }
  if (!options.lockedOnly && run.status === "draft") {
    return { error: "Run must be reviewed or locked to export" };
  }

  const [items, staff, branding, settings] = await Promise.all([
    listLineItemsForRun(runId),
    listAllStaff(),
    getBranding(),
    getSettings(),
  ]);

  if (!branding) return { error: "Venue branding not configured" };
  if (!settings) return { error: "Payroll settings not configured" };

  const staffMin = staff.map((s) => ({ id: s.id, full_name: s.full_name }));

  return {
    ctx: {
      current,
      buildInput: {
        run,
        lineItems: items,
        staff: staffMin,
        venueBranding: branding,
        settings,
        exporter: {
          staffId: current.staff.id,
          name: current.staff.full_name,
        },
      },
      filenameBase: `payroll-${run.period_start}-to-${run.period_end}`,
    },
  };
}

// =============================================================================
// CSV (existing — wired through the transformer in S27b)
// =============================================================================

export async function exportRunCsvAction(
  runId: string
): Promise<{ success: boolean; csv?: string; filename?: string; error?: string }> {
  const { ctx, error } = await loadExportContext(runId, { lockedOnly: false });
  if (!ctx) return { success: false, error };

  const csv = formatRunAsCsv(ctx.buildInput);
  const filename = `${ctx.filenameBase}.csv`;
  await setRunExported(runId, "csv");
  await writePayrollAuditLog(
    "payroll.run.exported",
    runId,
    ctx.current.staff.id,
    { format: "csv" }
  );
  return { success: true, csv, filename };
}

// =============================================================================
// JSON (S27b)
// =============================================================================

export async function exportRunJsonAction(runId: string): Promise<{
  success: boolean;
  json?: string;
  filename?: string;
  error?: string;
}> {
  const { ctx, error } = await loadExportContext(runId, { lockedOnly: true });
  if (!ctx) return { success: false, error };

  const doc = buildPayslipDocument(ctx.buildInput);
  const json = JSON.stringify(doc, null, 2);
  const filename = `${ctx.filenameBase}.json`;
  await setRunExported(runId, "json");
  await writePayrollAuditLog(
    "payroll.run.exported",
    runId,
    ctx.current.staff.id,
    { format: "json" }
  );
  return { success: true, json, filename };
}

// =============================================================================
// PDF — single payslip + batch (S27b)
// =============================================================================

export async function exportRunPdfAction(
  runId: string,
  staffId?: string
): Promise<{
  success: boolean;
  pdfBase64?: string;
  filename?: string;
  contentType?: string;
  error?: string;
}> {
  const { ctx, error } = await loadExportContext(runId, { lockedOnly: true });
  if (!ctx) return { success: false, error };

  const doc = buildPayslipDocument(ctx.buildInput);

  if (staffId) {
    // Single-staff path. Filter the document, render one PDF.
    const filtered = filterPayslipToStaff(doc, staffId);
    if (filtered.staff.length === 0) {
      return {
        success: false,
        error: "No payslip line items found for that staff in this run",
      };
    }
    const buffer = await renderPayslipPdf(filtered);
    const safeName = filtered.staff[0].full_name.replace(/[^A-Za-z0-9]+/g, "_");
    await setRunExported(runId, "pdf");
    await writePayrollAuditLog(
      "payroll.run.exported",
      runId,
      ctx.current.staff.id,
      { format: "pdf", staff_id: staffId }
    );
    return {
      success: true,
      pdfBase64: buffer.toString("base64"),
      filename: `${ctx.filenameBase}-${safeName}.pdf`,
      contentType: "application/pdf",
    };
  }

  // Batch path. One PDF per staff section, zipped together.
  if (doc.staff.length === 0) {
    return { success: false, error: "Run has no line items to export" };
  }
  const zip = new JSZip();
  for (const section of doc.staff) {
    const single = filterPayslipToStaff(doc, section.staff_id);
    const pdf = await renderPayslipPdf(single);
    const safeName = section.full_name.replace(/[^A-Za-z0-9]+/g, "_");
    zip.file(`${ctx.filenameBase}-${safeName}.pdf`, pdf);
  }
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  await setRunExported(runId, "pdf");
  await writePayrollAuditLog(
    "payroll.run.exported",
    runId,
    ctx.current.staff.id,
    { format: "pdf_batch", staff_count: doc.staff.length }
  );
  return {
    success: true,
    pdfBase64: zipBuffer.toString("base64"),
    filename: `${ctx.filenameBase}-payslips.zip`,
    contentType: "application/zip",
  };
}

// =============================================================================
// Staff-side payslip read (S27b)
// =============================================================================

/**
 * Returns the PayslipDocument filtered to a single staff section. Staff
 * may only request their own payslip; manager+owner may request any
 * staff's. Locked runs only — drafts and review runs are not visible to
 * staff. This action powers `/staff/payroll/runs/[id]`.
 */
export async function getStaffPayslipAction(input: {
  runId: string;
  staffId?: string;
}): Promise<{
  success: boolean;
  doc?: PayslipDocument;
  error?: string;
}> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isStaff(current.role)) {
    return { success: false, error: "Staff role required" };
  }

  const targetStaffId = input.staffId ?? current.staff.id;
  // Staff may only read their own payslip; manager+owner can see anyone's.
  if (targetStaffId !== current.staff.id && !isManager(current.role)) {
    return { success: false, error: "Cannot view another staff's payslip" };
  }

  const run = await getRun(input.runId);
  if (!run) return { success: false, error: "Run not found" };
  if (run.status !== "locked") {
    return { success: false, error: "Payslip not yet finalised" };
  }

  const [items, staff, branding, settings] = await Promise.all([
    listLineItemsForRun(input.runId),
    listAllStaff(),
    getBranding(),
    getSettings(),
  ]);
  if (!branding) return { success: false, error: "Venue branding not configured" };
  if (!settings) return { success: false, error: "Payroll settings not configured" };

  const doc = buildPayslipDocument({
    run,
    lineItems: items,
    staff: staff.map((s) => ({ id: s.id, full_name: s.full_name })),
    venueBranding: branding,
    settings,
    exporter: { staffId: current.staff.id, name: current.staff.full_name },
  });
  const filtered = filterPayslipToStaff(doc, targetStaffId);
  if (filtered.staff.length === 0) {
    return { success: false, error: "No payslip available for this staff" };
  }
  return { success: true, doc: filtered };
}
