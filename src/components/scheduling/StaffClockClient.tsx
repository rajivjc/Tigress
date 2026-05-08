"use client";

import { useMemo, useState, useTransition } from "react";
import { Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  clockInAction,
  clockOutForShiftAction,
  requestClockCorrectionAction,
} from "@/scheduling/actions/clock";
import type {
  ClockCorrection,
  ClockRecord,
  ScheduleShift,
  ShiftTemplate,
} from "@/scheduling/types";

interface Props {
  currentUserId: string;
  today: string;
  shifts: ScheduleShift[];
  templates: ShiftTemplate[];
  records: ClockRecord[];
  correctionsByRecord: Record<string, ClockCorrection[]>;
}

export function StaffClockClient({
  currentUserId,
  today,
  shifts,
  templates,
  records,
  correctionsByRecord,
}: Props) {
  const templateById = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates]
  );
  const recordByShift = useMemo(() => {
    const m = new Map<string, ClockRecord>();
    for (const r of records) m.set(r.shift_id, r);
    return m;
  }, [records]);

  const todayShifts = shifts.filter((s) => s.shift_date === today);
  const recentShifts = shifts
    .filter((s) => s.shift_date !== today)
    .sort((a, b) => b.shift_date.localeCompare(a.shift_date));

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClockIn(shiftId: string) {
    setError(null);
    startTransition(async () => {
      const r = await clockInAction(shiftId);
      if (!r.success) setError(r.error ?? "Failed to clock in");
    });
  }
  function handleClockOut(shiftId: string) {
    setError(null);
    startTransition(async () => {
      const r = await clockOutForShiftAction(shiftId);
      if (!r.success) setError(r.error ?? "Failed to clock out");
    });
  }

  return (
    <div className="space-y-4 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Operations
        </p>
        <h1 className="text-xl font-bold text-white">Clock</h1>
        <p className="mt-0.5 text-xs text-white/50">
          Today is {today}. Honor system — please be accurate.
        </p>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <AlertCircle size={14} strokeWidth={1.5} className="mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-white">Today</h2>
        {todayShifts.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No shift scheduled today"
            description="Enjoy your day off."
          />
        ) : (
          <ul className="space-y-2">
            {todayShifts.map((s) => {
              const tpl = templateById.get(s.template_id);
              const rec = recordByShift.get(s.id);
              const isAssignee = s.user_id === currentUserId;
              return (
                <li
                  key={s.id}
                  className="rounded-2xl border border-white/10 bg-surface-1 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {tpl?.name ?? "Shift"} · {s.role}
                      </div>
                      <div className="text-xs text-white/50">
                        {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                      </div>
                    </div>
                    {isAssignee && !rec && (
                      <button
                        type="button"
                        onClick={() => handleClockIn(s.id)}
                        disabled={pending}
                        className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
                      >
                        Clock in
                      </button>
                    )}
                    {isAssignee && rec?.status === "active" && (
                      <button
                        type="button"
                        onClick={() => handleClockOut(s.id)}
                        disabled={pending}
                        className="rounded-md bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500/90 disabled:opacity-50"
                      >
                        Clock out
                      </button>
                    )}
                    {isAssignee && rec?.status === "pending_review" && (
                      <span className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                        <CheckCircle2 size={12} strokeWidth={1.5} /> Awaiting review
                      </span>
                    )}
                    {isAssignee && rec?.status === "locked" && (
                      <span className="rounded-md border border-white/10 bg-surface-2 px-2 py-1 text-xs text-white/60">
                        Locked
                      </span>
                    )}
                  </div>
                  {rec && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/60">
                      <span>
                        In: {new Date(rec.clocked_in_at).toLocaleTimeString()}
                      </span>
                      {rec.clocked_out_at && (
                        <span>
                          Out:{" "}
                          {new Date(rec.clocked_out_at).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-white">
          Recent history (14 days)
        </h2>
        {recentShifts.length === 0 ? (
          <p className="text-xs text-white/40">No previous shifts.</p>
        ) : (
          <ul className="space-y-2">
            {recentShifts.map((s) => {
              const tpl = templateById.get(s.template_id);
              const rec = recordByShift.get(s.id);
              const corrections = rec ? correctionsByRecord[rec.id] ?? [] : [];
              return (
                <li
                  key={s.id}
                  className="rounded-2xl border border-white/10 bg-surface-1 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-white/40">{s.shift_date}</div>
                      <div className="text-sm text-white">
                        {tpl?.name ?? "Shift"} · {s.role} ·{" "}
                        {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                      </div>
                    </div>
                    {rec ? (
                      <CorrectionLauncher
                        recordId={rec.id}
                        status={rec.status}
                        existingCorrections={corrections}
                      />
                    ) : (
                      <span className="text-xs text-white/40">No clock record</span>
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

function CorrectionLauncher({
  recordId,
  status,
  existingCorrections,
}: {
  recordId: string;
  status: ClockRecord["status"];
  existingCorrections: ClockCorrection[];
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [proposedIn, setProposedIn] = useState("");
  const [proposedOut, setProposedOut] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pending_existing = existingCorrections.find((c) => c.status === "pending");
  if (pending_existing) {
    return (
      <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
        Correction pending
      </span>
    );
  }
  if (status === "active") {
    return <span className="text-xs text-white/40">Active</span>;
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await requestClockCorrectionAction({
        clockRecordId: recordId,
        proposedClockedInAt: proposedIn || null,
        proposedClockedOutAt: proposedOut || null,
        reason,
      });
      if (!r.success) {
        setError(r.error ?? "Failed");
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <div className="text-right">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-white/10 bg-surface-2 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
        >
          Request correction
        </button>
      ) : (
        <div className="w-64 space-y-2">
          <input
            type="datetime-local"
            value={proposedIn}
            onChange={(e) => setProposedIn(e.target.value ? `${e.target.value}:00` : "")}
            className="w-full rounded-md border border-white/10 bg-surface-2 px-2 py-1 text-xs text-white"
            placeholder="Proposed clock-in"
          />
          <input
            type="datetime-local"
            value={proposedOut}
            onChange={(e) => setProposedOut(e.target.value ? `${e.target.value}:00` : "")}
            className="w-full rounded-md border border-white/10 bg-surface-2 px-2 py-1 text-xs text-white"
            placeholder="Proposed clock-out"
          />
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            rows={2}
            className="w-full rounded-md border border-white/10 bg-surface-2 px-2 py-1 text-xs text-white"
          />
          {error && <p className="text-xs text-rose-300">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={pending || !reason}
              className="flex-1 rounded-md bg-accent px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-md border border-white/10 bg-surface-2 px-2 py-1 text-xs text-white/70"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
