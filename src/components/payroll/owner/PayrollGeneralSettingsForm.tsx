"use client";

import { useState, useTransition } from "react";
import { setPayrollSettingsAction } from "@/scheduling/payroll/actions/configuration";
import type {
  PayrollSettings,
  PayFrequency,
  PayrollExportFormat,
} from "@/scheduling/payroll/types";

interface Props {
  settings: PayrollSettings | null;
}

const FREQUENCIES: PayFrequency[] = ["weekly", "fortnightly", "monthly"];
const FORMATS: PayrollExportFormat[] = ["csv", "pdf", "json"];

export function PayrollGeneralSettingsForm({ settings }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [frequency, setFrequency] = useState<PayFrequency>(
    settings?.pay_frequency ?? "monthly"
  );
  const [offsetDays, setOffsetDays] = useState(
    String(settings?.payment_offset_days ?? 7)
  );
  const [format, setFormat] = useState<PayrollExportFormat>(
    settings?.default_export_format ?? "csv"
  );
  const [statutoryPct, setStatutoryPct] = useState(
    String(settings?.statutory_deduction_pct ?? 0)
  );
  const [currency, setCurrency] = useState(settings?.currency ?? "SGD");
  const [timezone, setTimezone] = useState(
    settings?.timezone ?? "Asia/Singapore"
  );

  if (!settings) {
    return (
      <p className="rounded border border-rose-700 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
        Payroll settings row not found. Run the 024 migration first.
      </p>
    );
  }

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const r = await setPayrollSettingsAction({
        payFrequency: frequency,
        paymentOffsetDays: Number(offsetDays),
        defaultExportFormat: format,
        statutoryDeductionPct: Number(statutoryPct),
        currency,
        timezone,
      });
      if (!r.success) {
        setError(r.error ?? "Save failed");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <Field label="Pay frequency">
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as PayFrequency)}
          className={inputClass}
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Payment offset days (period_end + N)">
        <input
          type="number"
          min={0}
          value={offsetDays}
          onChange={(e) => setOffsetDays(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Default export format">
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as PayrollExportFormat)}
          className={inputClass}
        >
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Statutory deduction (%)">
        <input
          type="number"
          step="0.01"
          min={0}
          max={100}
          value={statutoryPct}
          onChange={(e) => setStatutoryPct(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Currency">
        <input
          type="text"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          maxLength={3}
          className={inputClass}
        />
      </Field>
      <Field label="Timezone (IANA, e.g. Asia/Singapore)">
        <input
          type="text"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className={inputClass}
        />
      </Field>
      {error && (
        <p className="text-sm text-rose-300">{error}</p>
      )}
      {saved && (
        <p className="text-sm text-emerald-300">Saved.</p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-400 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
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
