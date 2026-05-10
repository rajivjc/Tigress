"use client";

import { useState, useTransition } from "react";
import { updateBrandingAction } from "@/scheduling/payroll/actions/branding";
import type { PayrollVenueBranding } from "@/scheduling/payroll/types";

interface Props {
  branding: PayrollVenueBranding | null;
}

export function PayrollBrandingForm({ branding }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [venueName, setVenueName] = useState(branding?.venue_name ?? "");
  const [address, setAddress] = useState(branding?.address ?? "");
  const [contactEmail, setContactEmail] = useState(branding?.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(branding?.contact_phone ?? "");
  const [logoUrl, setLogoUrl] = useState(branding?.logo_url ?? "");

  if (!branding) {
    return (
      <p className="rounded border border-rose-700 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
        Branding row not found. Run the 024 migration first.
      </p>
    );
  }

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const r = await updateBrandingAction({
        venueName,
        address,
        contactEmail,
        contactPhone,
        logoUrl,
      });
      if (!r.success) {
        setError(r.error ?? "Save failed");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <Field label="Venue name">
          <input
            type="text"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Address (free text, multi-line OK)">
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </Field>
        <Field label="Contact email">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Contact phone">
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Logo URL (https only; leave empty for text-only header)">
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            className={inputClass}
          />
        </Field>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {saved && <p className="text-sm text-emerald-300">Saved.</p>}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-400 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save branding"}
        </button>
      </div>
      <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <p className="text-xs uppercase text-zinc-500">Live preview</p>
        <div className="flex items-start justify-between gap-3 rounded border border-zinc-700 bg-zinc-950 p-3">
          <div>
            <p className="text-base font-semibold text-zinc-100">
              {venueName || "Venue name"}
            </p>
            {address && (
              <p className="text-xs whitespace-pre-line text-zinc-400">
                {address}
              </p>
            )}
            {contactEmail && (
              <p className="text-xs text-zinc-500">{contactEmail}</p>
            )}
            {contactPhone && (
              <p className="text-xs text-zinc-500">{contactPhone}</p>
            )}
          </div>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo preview"
              className="h-12 w-12 object-contain"
            />
          )}
        </div>
        <p className="text-xs text-zinc-500">
          The PDF and on-screen payslip use this header verbatim. Logo URL
          must be hosted somewhere reachable over HTTPS — there&apos;s no
          upload pipeline.
        </p>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
