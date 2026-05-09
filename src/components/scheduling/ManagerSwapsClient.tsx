"use client";

import { useMemo, useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { reverseSwapAction } from "@/scheduling/actions/swaps";
import type {
  ScheduleShift,
  ShiftChangeRequest,
} from "@/scheduling/types";
import type { Staff } from "@/lib/types";

interface Props {
  pending: ShiftChangeRequest[];
  accepted: ShiftChangeRequest[];
  giveaways: ShiftChangeRequest[];
  shifts: ScheduleShift[];
  allStaff: Staff[];
}

export function ManagerSwapsClient(props: Props) {
  const shiftById = useMemo(
    () => new Map(props.shifts.map((s) => [s.id, s])),
    [props.shifts]
  );
  const staffById = useMemo(
    () => new Map(props.allStaff.map((s) => [s.id, s])),
    [props.allStaff]
  );

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function describeShift(req: ShiftChangeRequest): string {
    const s = shiftById.get(req.shift_id);
    if (!s) return "Shift";
    return `${s.shift_date} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)} · ${s.role}`;
  }

  return (
    <div className="space-y-4 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Manager
        </p>
        <h1 className="text-xl font-bold text-white">Swap activity</h1>
        <p className="mt-0.5 text-xs text-white/50">
          Visibility on swaps and giveaways. Reversals available within shift window.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-white">Pending</h2>
        {props.pending.length === 0 ? (
          <p className="text-xs text-white/40">Nothing pending.</p>
        ) : (
          <ul className="space-y-2">
            {props.pending.map((req) => (
              <li
                key={req.id}
                className="rounded-2xl border border-white/10 bg-surface-1 p-3 text-xs text-white/80"
              >
                <span className="font-semibold text-white">
                  {req.kind === "direct_swap" ? "Direct swap" : "Giveaway"}
                </span>{" "}
                · {describeShift(req)} · from{" "}
                {staffById.get(req.requested_by)?.full_name ?? "Unknown"}
                {req.target_user_id && (
                  <>
                    {" "}
                    → to{" "}
                    {staffById.get(req.target_user_id)?.full_name ?? "Unknown"}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-white">
          Accepted (last 7 days)
        </h2>
        {props.accepted.length === 0 ? (
          <p className="text-xs text-white/40">No recent activity.</p>
        ) : (
          <ul className="space-y-2">
            {props.accepted.map((req) => (
              <li
                key={req.id}
                className="rounded-2xl border border-white/10 bg-surface-1 p-3"
              >
                <div className="text-xs text-white/60">
                  {describeShift(req)}
                </div>
                <div className="text-sm text-white">
                  {staffById.get(req.requested_by)?.full_name ?? "—"} →{" "}
                  {staffById.get(req.accepted_by ?? "")?.full_name ?? "—"}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const note = window.prompt(
                      "Reversal note (required):"
                    );
                    if (!note || !note.trim()) return;
                    setError(null);
                    startTransition(async () => {
                      const r = await reverseSwapAction({
                        requestId: req.id,
                        note,
                      });
                      if (!r.success) setError(r.error ?? "Failed");
                    });
                  }}
                  disabled={pending}
                  className="mt-2 flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200"
                >
                  <Undo2 size={12} strokeWidth={1.5} /> Reverse
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-white">
          Active giveaways
        </h2>
        {props.giveaways.length === 0 ? (
          <p className="text-xs text-white/40">No open giveaways.</p>
        ) : (
          <ul className="space-y-2">
            {props.giveaways.map((req) => (
              <li
                key={req.id}
                className="rounded-2xl border border-white/10 bg-surface-1 p-3 text-xs text-white/80"
              >
                {describeShift(req)} · from{" "}
                {staffById.get(req.requested_by)?.full_name ?? "Unknown"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
