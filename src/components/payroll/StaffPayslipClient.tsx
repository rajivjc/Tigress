"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { exportRunPdfAction } from "@/scheduling/payroll/actions/export";
import type { PayslipDocument } from "@/scheduling/payroll/lib/payslip-transformer";

interface Props {
  doc: PayslipDocument;
  runId: string;
}

function downloadBase64(filename: string, base64: string, contentType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fmt(currency: string, n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}${currency} ${Math.abs(n).toFixed(2)}`;
}

export function StaffPayslipClient({ doc, runId }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const section = doc.staff[0];
  const currency = doc.run.currency;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="flex items-baseline justify-between">
        <Link
          href="/staff/payroll"
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          ← Payslips
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              try {
                const r = await exportRunPdfAction(runId, section.staff_id);
                if (!r.success || !r.pdfBase64 || !r.filename || !r.contentType) {
                  throw new Error(r.error ?? "Download failed");
                }
                downloadBase64(r.filename, r.pdfBase64, r.contentType);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed");
              }
            })
          }
          className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-500 disabled:opacity-60"
        >
          {pending ? "Preparing…" : "Download payslip (PDF)"}
        </button>
      </div>

      {error && (
        <div className="rounded border border-rose-700 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-zinc-100">
              {doc.venue.name}
            </p>
            {doc.venue.address && (
              <p className="text-xs text-zinc-400">{doc.venue.address}</p>
            )}
            {doc.venue.contact_email && (
              <p className="text-xs text-zinc-500">{doc.venue.contact_email}</p>
            )}
          </div>
          {doc.venue.logo_url && (
            // Plain <img> — we don't keep an allow-list of branding URLs.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.venue.logo_url}
              alt="Venue logo"
              className="h-12 w-12 object-contain"
            />
          )}
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-zinc-100">
          Payslip — {doc.run.period_start} to {doc.run.period_end}
        </h1>
        <p className="text-sm text-zinc-400">
          Payment date: {doc.run.payment_date}
        </p>
        <p className="text-xs text-zinc-500">
          {doc.run.locked_at
            ? `Locked ${new Date(doc.run.locked_at).toLocaleString()} by ${doc.run.locked_by_name}`
            : `Status: ${doc.run.status}`}
        </p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <p className="text-base font-medium text-zinc-100">{section.full_name}</p>
        <p className="text-xs text-zinc-500">Employee ID: {section.staff_id}</p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-3 text-sm uppercase text-zinc-500">Line items</h2>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-zinc-500">
            <tr className="border-b border-zinc-800">
              <th className="py-2 text-left">Kind</th>
              <th className="py-2 text-left">Description</th>
              <th className="py-2 text-right">Hours</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Amount</th>
              <th className="py-2 text-right">Source</th>
            </tr>
          </thead>
          <tbody>
            {section.line_items.map((item) => (
              <tr key={item.id} className="border-t border-zinc-800">
                <td className="py-1.5 text-zinc-400">{item.kind}</td>
                <td className="py-1.5 text-zinc-200">
                  {item.label}
                  {item.sample_clock_record_id && (
                    <span
                      className="ml-2 cursor-help text-xs text-zinc-500"
                      title="This line aggregates multiple clock records — the link drills into one of them. View clock history for the full set."
                    >
                      (sample record)
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right text-zinc-400">
                  {item.hours !== null ? item.hours.toFixed(2) : ""}
                </td>
                <td className="py-1.5 text-right text-zinc-400">
                  {item.rate_applied !== null ? item.rate_applied.toFixed(2) : ""}
                </td>
                <td className="py-1.5 text-right text-zinc-100">
                  {fmt(currency, item.amount)}
                </td>
                <td className="py-1.5 text-right text-xs text-zinc-500">
                  {item.source}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-zinc-300">
            <span>Gross</span>
            <span>{fmt(currency, section.totals.gross)}</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Deductions</span>
            <span>{fmt(currency, section.totals.deductions_total)}</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Statutory</span>
            <span>{fmt(currency, section.totals.statutory_total)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-zinc-700 pt-2 text-base font-semibold text-zinc-100">
            <span>Net</span>
            <span>{fmt(currency, section.totals.net)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        Format v{doc.metadata.format_version}. Generated{" "}
        {new Date(doc.metadata.exported_at).toLocaleString()} by{" "}
        {doc.metadata.exported_by}.
      </p>
    </div>
  );
}
