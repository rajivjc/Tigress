"use client";

import { useState, useTransition } from "react";
import { setOvertimeRulesAction } from "@/scheduling/payroll/actions/configuration";
import type {
  PayrollOvertimeRules,
  RestDayStrategy,
} from "@/scheduling/payroll/types";

interface Props {
  rules: PayrollOvertimeRules | null;
}

const STRATEGIES: RestDayStrategy[] = [
  "sunday",
  "configured_per_staff",
  "none",
];

export function PayrollOvertimeRulesForm({ rules }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [weeklyEnabled, setWeeklyEnabled] = useState(
    rules?.weekly_threshold_hours !== null
  );
  const [weeklyHrs, setWeeklyHrs] = useState(
    String(rules?.weekly_threshold_hours ?? 44)
  );
  const [weeklyMult, setWeeklyMult] = useState(
    String(rules?.weekly_ot_multiplier ?? 1.5)
  );
  const [dailyEnabled, setDailyEnabled] = useState(
    rules?.daily_threshold_hours !== null
  );
  const [dailyHrs, setDailyHrs] = useState(
    String(rules?.daily_threshold_hours ?? 8)
  );
  const [dailyMult, setDailyMult] = useState(
    String(rules?.daily_ot_multiplier ?? 1.5)
  );
  const [restMult, setRestMult] = useState(
    String(rules?.rest_day_multiplier ?? 2.0)
  );
  const [phMult, setPhMult] = useState(
    String(rules?.public_holiday_multiplier ?? 2.0)
  );
  const [strategy, setStrategy] = useState<RestDayStrategy>(
    rules?.rest_day_strategy ?? "sunday"
  );

  if (!rules) {
    return (
      <p className="rounded border border-rose-700 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
        Overtime rules row not found.
      </p>
    );
  }

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const r = await setOvertimeRulesAction({
        weeklyThresholdHours: weeklyEnabled ? Number(weeklyHrs) : null,
        weeklyOtMultiplier: Number(weeklyMult),
        dailyThresholdHours: dailyEnabled ? Number(dailyHrs) : null,
        dailyOtMultiplier: Number(dailyMult),
        restDayMultiplier: Number(restMult),
        publicHolidayMultiplier: Number(phMult),
        restDayStrategy: strategy,
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
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-zinc-200">
          <input
            type="checkbox"
            checked={weeklyEnabled}
            onChange={(e) => setWeeklyEnabled(e.target.checked)}
          />
          Weekly overtime
        </label>
        {weeklyEnabled && (
          <div className="ml-6 flex gap-2">
            <input
              type="number"
              step="0.01"
              value={weeklyHrs}
              onChange={(e) => setWeeklyHrs(e.target.value)}
              className={inputClass}
              placeholder="Hours threshold"
            />
            <input
              type="number"
              step="0.01"
              value={weeklyMult}
              onChange={(e) => setWeeklyMult(e.target.value)}
              className={inputClass}
              placeholder="Multiplier"
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-zinc-200">
          <input
            type="checkbox"
            checked={dailyEnabled}
            onChange={(e) => setDailyEnabled(e.target.checked)}
          />
          Daily overtime
        </label>
        {dailyEnabled && (
          <div className="ml-6 flex gap-2">
            <input
              type="number"
              step="0.01"
              value={dailyHrs}
              onChange={(e) => setDailyHrs(e.target.value)}
              className={inputClass}
              placeholder="Hours threshold"
            />
            <input
              type="number"
              step="0.01"
              value={dailyMult}
              onChange={(e) => setDailyMult(e.target.value)}
              className={inputClass}
              placeholder="Multiplier"
            />
          </div>
        )}
      </div>

      <Field label="Rest day multiplier">
        <input
          type="number"
          step="0.01"
          value={restMult}
          onChange={(e) => setRestMult(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Public holiday multiplier">
        <input
          type="number"
          step="0.01"
          value={phMult}
          onChange={(e) => setPhMult(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Rest day strategy">
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as RestDayStrategy)}
          className={inputClass}
        >
          {STRATEGIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {saved && <p className="text-sm text-emerald-300">Saved.</p>}
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-400 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save overtime rules"}
      </button>
    </div>
  );
}

const inputClass =
  "flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100";

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
