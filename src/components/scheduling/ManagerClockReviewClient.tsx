"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Lock, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import {
  lockClockRecordsAction,
  resolveClockCorrectionAction,
  unlockClockRecordAction,
} from "@/scheduling/actions/clock";
import {
  clearAttendanceFlagAction,
  markExcusedAction,
  markNoShowAction,
} from "@/scheduling/actions/attendance";
import {
  applyRoundingRules,
} from "@/scheduling/lib/clock-rounding";
import {
  getShiftAttendanceState,
} from "@/scheduling/lib/attendance-state";
import { addDaysSGT } from "@/lib/timezone";
import type {
  ClockCorrection,
  ClockRecord,
  ScheduleShift,
  ShiftAttendance,
  ShiftAttendanceState,
  ShiftTemplate,
} from "@/scheduling/types";
import type { Staff } from "@/lib/types";

interface Props {
  date: string;
  shifts: ScheduleShift[];
  records: ClockRecord[];
  attendance: ShiftAttendance[];
  templates: ShiftTemplate[];
  allStaff: Staff[];
  pendingCorrections: ClockCorrection[];
}

const STATE_LABEL: Record<ShiftAttendanceState, string> = {
  expected: "Expected",
  clocked_in: "Clocked in",
  completed: "Completed",
  missing: "Missing",
  excused: "Excused",
  no_show: "No-show",
};

const STATE_TONE: Record<ShiftAttendanceState, string> = {
  expected: "border-white/10 bg-surface-2 text-white/60",
  clocked_in: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  completed: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  missing: "border-rose-500/60 bg-rose-500/15 text-rose-200",
  excused: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  no_show: "border-rose-500/60 bg-rose-500/15 text-rose-200",
};

export function ManagerClockReviewClient(props: Props) {
  const templateById = useMemo(
    () => new Map(props.templates.map((t) => [t.id, t])),
    [props.templates]
  );
  const staffById = useMemo(
    () => new Map(props.allStaff.map((s) => [s.id, s])),
    [props.allStaff]
  );
  const recordByShift = useMemo(() => {
    const m = new Map<string, ClockRecord>();
    for (const r of props.records) m.set(r.shift_id, r);
    return m;
  }, [props.records]);
  const attendanceByShift = useMemo(() => {
    const m = new Map<string, ShiftAttendance>();
    for (const a of props.attendance) m.set(a.shift_id, a);
    return m;
  }, [props.attendance]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function withGuard(p: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await p();
      if (!r.success) setError(r.error ?? "Failed");
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Manager
          </p>
          <h1 className="text-xl font-bold text-white">Clock review</h1>
          <p className="mt-0.5 text-xs text-white/50">
            {props.date} — daily-close workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/manager/scheduling/clock-review?date=${addDaysSGT(props.date, -1)}`}
            className="rounded-md border border-white/10 bg-surface-2 px-2 py-1.5 text-xs text-white/70"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </Link>
          <Link
            href={`/manager/scheduling/clock-review?date=${addDaysSGT(props.date, 1)}`}
            className="rounded-md border border-white/10 bg-surface-2 px-2 py-1.5 text-xs text-white/70"
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      {props.pendingCorrections.length > 0 && (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
            <AlertTriangle size={14} strokeWidth={1.5} /> Outstanding corrections
          </h2>
          <ul className="space-y-2">
            {props.pendingCorrections.map((c) => (
              <li key={c.id} className="rounded-md border border-white/10 bg-surface-1 p-3">
                <div className="text-xs text-white/60">
                  {staffById.get(c.requested_by)?.full_name ?? "Unknown"}
                </div>
                <div className="text-sm text-white">{c.reason}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      withGuard(() =>
                        resolveClockCorrectionAction({
                          correctionId: c.id,
                          decision: "approve",
                        })
                      )
                    }
                    disabled={pending}
                    className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-semibold text-white"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      withGuard(() =>
                        resolveClockCorrectionAction({
                          correctionId: c.id,
                          decision: "deny",
                        })
                      )
                    }
                    disabled={pending}
                    className="rounded-md border border-white/10 bg-surface-2 px-3 py-1 text-xs text-white/70"
                  >
                    Deny
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Shifts</h2>
          <button
            type="button"
            onClick={() =>
              withGuard(async () => {
                const ids = Array.from(selected);
                const r = await lockClockRecordsAction(ids);
                if (r.success) setSelected(new Set());
                return r;
              })
            }
            disabled={pending || selected.size === 0}
            className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Lock size={12} strokeWidth={1.5} /> Lock {selected.size || ""}
          </button>
        </div>
        {props.shifts.length === 0 ? (
          <p className="text-xs text-white/40">No shifts on this day.</p>
        ) : (
          <ul className="space-y-2">
            {props.shifts.map((s) => {
              const rec = recordByShift.get(s.id) ?? null;
              const att = attendanceByShift.get(s.id) ?? null;
              const state = getShiftAttendanceState({
                shift: s,
                now: new Date(),
                clockRecord: rec,
                attendance: att,
              });
              const tpl = templateById.get(s.template_id);
              const user = s.user_id ? staffById.get(s.user_id) : null;
              const rounded =
                rec && rec.clocked_out_at
                  ? applyRoundingRules({
                      scheduledStart: `${s.shift_date}T${s.start_time}+08:00`,
                      scheduledEnd: `${s.shift_date}T${s.end_time}+08:00`,
                      actualIn: rec.clocked_in_at,
                      actualOut: rec.clocked_out_at,
                    })
                  : null;
              const lockable = rec?.status === "pending_review";
              return (
                <li
                  key={s.id}
                  className="rounded-2xl border border-white/10 bg-surface-1 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        disabled={!lockable}
                        checked={selected.has(rec?.id ?? "")}
                        onChange={() => rec && toggleSelect(rec.id)}
                        className="size-4 accent-accent"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">
                          {tpl?.name ?? "Shift"} · {s.role} ·{" "}
                          {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                        </div>
                        <div className="text-xs text-white/60">
                          {user?.full_name ?? "Unfilled"}
                        </div>
                      </div>
                    </label>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] ${STATE_TONE[state]}`}
                    >
                      {STATE_LABEL[state]}
                    </span>
                  </div>
                  {rec && (
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/60">
                      <span>
                        In: {new Date(rec.clocked_in_at).toLocaleTimeString()}
                      </span>
                      {rec.clocked_out_at && (
                        <span>
                          Out:{" "}
                          {new Date(rec.clocked_out_at).toLocaleTimeString()}
                        </span>
                      )}
                      {rounded && (
                        <span className="col-span-2 text-white/80">
                          Effective: {rounded.durationMinutes} min
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!att && s.user_id && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            withGuard(() => markNoShowAction({ shiftId: s.id }))
                          }
                          disabled={pending}
                          className="rounded-md border border-white/10 bg-surface-2 px-2 py-1 text-xs text-white/70"
                        >
                          Mark no-show
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const note = window.prompt("Reason for excused absence:");
                            if (note && note.trim()) {
                              withGuard(() =>
                                markExcusedAction({ shiftId: s.id, note })
                              );
                            }
                          }}
                          disabled={pending}
                          className="rounded-md border border-white/10 bg-surface-2 px-2 py-1 text-xs text-white/70"
                        >
                          Mark excused
                        </button>
                      </>
                    )}
                    {att && (
                      <button
                        type="button"
                        onClick={() =>
                          withGuard(() => clearAttendanceFlagAction(s.id))
                        }
                        disabled={pending}
                        className="rounded-md border border-white/10 bg-surface-2 px-2 py-1 text-xs text-white/70"
                      >
                        Clear flag
                      </button>
                    )}
                    {rec?.status === "locked" && (
                      <button
                        type="button"
                        onClick={() => {
                          const note = window.prompt(
                            "Note for unlock (required):"
                          );
                          if (note && note.trim()) {
                            withGuard(() =>
                              unlockClockRecordAction({
                                clockRecordId: rec.id,
                                note,
                              })
                            );
                          }
                        }}
                        disabled={pending}
                        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200"
                      >
                        Unlock
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
