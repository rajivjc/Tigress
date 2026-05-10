"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeRateRuleAction,
  upsertRateRuleAction,
} from "@/scheduling/payroll/actions/configuration";
import type {
  PayrollRateRule,
  RateRuleKind,
} from "@/scheduling/payroll/types";

interface Props {
  rules: PayrollRateRule[];
}

export function PayrollRateRulesEditor({ rules }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const role = rules.filter((r) => r.kind === "role");
  const tod = rules.filter((r) => r.kind === "time_of_day");

  function remove(id: string) {
    start(async () => {
      setError(null);
      const r = await removeRateRuleAction(id);
      if (!r.success) {
        setError(r.error ?? "Remove failed");
        return;
      }
      router.refresh();
    });
  }

  function add(input: {
    kind: RateRuleKind;
    matchValue: string;
    multiplier: number;
    priority: number;
    windowStart?: string | null;
    windowEnd?: string | null;
  }) {
    start(async () => {
      setError(null);
      const r = await upsertRateRuleAction({
        kind: input.kind,
        match_value: input.matchValue,
        multiplier: input.multiplier,
        priority: input.priority,
        is_active: true,
        window_start: input.windowStart ?? null,
        window_end: input.windowEnd ?? null,
      });
      if (!r.success) {
        setError(r.error ?? "Add failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded border border-rose-700 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm uppercase text-zinc-500">Role multipliers</h2>
        {role.length === 0 ? (
          <p className="rounded border border-zinc-800 p-3 text-xs text-zinc-500">
            No role multipliers configured. Add one below.
          </p>
        ) : (
          <ul className="space-y-1">
            {role.map((r) => (
              <RuleRow key={r.id} rule={r} onRemove={() => remove(r.id)} />
            ))}
          </ul>
        )}
        <AddRoleForm pending={pending} onAdd={add} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase text-zinc-500">Time-of-day multipliers</h2>
        {tod.length === 0 ? (
          <p className="rounded border border-zinc-800 p-3 text-xs text-zinc-500">
            No time-of-day multipliers configured.
          </p>
        ) : (
          <ul className="space-y-1">
            {tod.map((r) => (
              <RuleRow key={r.id} rule={r} onRemove={() => remove(r.id)} />
            ))}
          </ul>
        )}
        <AddTimeOfDayForm pending={pending} onAdd={add} />
      </section>
    </div>
  );
}

function RuleRow({
  rule,
  onRemove,
}: {
  rule: PayrollRateRule;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm">
      <span className="text-zinc-100">
        {rule.kind === "role"
          ? `Role: ${rule.match_value}`
          : `Window ${rule.window_start ?? "?"}–${rule.window_end ?? "?"} (${rule.match_value})`}
      </span>
      <span className="flex items-center gap-3">
        <span className="text-zinc-300">×{rule.multiplier}</span>
        <span className="text-xs text-zinc-500">
          priority {rule.priority}
        </span>
        {!rule.is_active && (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
            inactive
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-rose-300 hover:underline"
        >
          Remove
        </button>
      </span>
    </li>
  );
}

function AddRoleForm({
  pending,
  onAdd,
}: {
  pending: boolean;
  onAdd: (input: {
    kind: RateRuleKind;
    matchValue: string;
    multiplier: number;
    priority: number;
  }) => void;
}) {
  const [match, setMatch] = useState("");
  const [mult, setMult] = useState("");
  const [pri, setPri] = useState("100");
  const valid = match && Number(mult) > 0 && Number(pri) >= 0;
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
      <p className="mb-2 text-xs uppercase text-zinc-500">Add role multiplier</p>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Role (e.g. bartender)"
          value={match}
          onChange={(e) => setMatch(e.target.value)}
          className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
        />
        <input
          type="number"
          step="0.01"
          min={0}
          placeholder="Multiplier"
          value={mult}
          onChange={(e) => setMult(e.target.value)}
          className="w-32 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
        />
        <input
          type="number"
          min={0}
          placeholder="Priority"
          value={pri}
          onChange={(e) => setPri(e.target.value)}
          className="w-24 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
        />
        <button
          type="button"
          disabled={pending || !valid}
          onClick={() =>
            onAdd({
              kind: "role",
              matchValue: match,
              multiplier: Number(mult),
              priority: Number(pri),
            })
          }
          className="rounded bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-400 disabled:opacity-60"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function AddTimeOfDayForm({
  pending,
  onAdd,
}: {
  pending: boolean;
  onAdd: (input: {
    kind: RateRuleKind;
    matchValue: string;
    multiplier: number;
    priority: number;
    windowStart?: string | null;
    windowEnd?: string | null;
  }) => void;
}) {
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [mult, setMult] = useState("");
  const [pri, setPri] = useState("100");
  const valid = label && start && end && Number(mult) > 0;
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
      <p className="mb-2 text-xs uppercase text-zinc-500">
        Add time-of-day multiplier
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Label (e.g. night shift)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
        />
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
        />
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
        />
        <input
          type="number"
          step="0.01"
          min={0}
          placeholder="×"
          value={mult}
          onChange={(e) => setMult(e.target.value)}
          className="w-24 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
        />
        <input
          type="number"
          min={0}
          placeholder="Pri"
          value={pri}
          onChange={(e) => setPri(e.target.value)}
          className="w-20 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
        />
        <button
          type="button"
          disabled={pending || !valid}
          onClick={() =>
            onAdd({
              kind: "time_of_day",
              matchValue: label,
              multiplier: Number(mult),
              priority: Number(pri),
              windowStart: start,
              windowEnd: end,
            })
          }
          className="rounded bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-400 disabled:opacity-60"
        >
          Add
        </button>
      </div>
    </div>
  );
}
