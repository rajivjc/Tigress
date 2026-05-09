"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeftRight, Gift } from "lucide-react";
import {
  acceptSwapRequestAction,
  cancelSwapRequestAction,
  claimGiveawayAction,
  declineSwapRequestAction,
  requestGiveawayAction,
} from "@/scheduling/actions/swaps";
import type {
  ScheduleShift,
  ShiftChangeRequest,
  ShiftTemplate,
  UserQualification,
} from "@/scheduling/types";
import type { Staff } from "@/lib/types";

interface Props {
  currentUserId: string;
  outgoing: ShiftChangeRequest[];
  incoming: ShiftChangeRequest[];
  giveaways: ShiftChangeRequest[];
  myShifts: ScheduleShift[];
  shifts: ScheduleShift[];
  templates: ShiftTemplate[];
  allStaff: Staff[];
  qualifications: UserQualification[];
  allWeekShifts: ScheduleShift[];
}

type Tab = "mine" | "inbox" | "marketplace";

export function StaffSwapsClient(props: Props) {
  const [tab, setTab] = useState<Tab>("inbox");
  const shiftById = useMemo(
    () => new Map(props.shifts.map((s) => [s.id, s])),
    [props.shifts]
  );
  const templateById = useMemo(
    () => new Map(props.templates.map((t) => [t.id, t])),
    [props.templates]
  );
  const staffById = useMemo(
    () => new Map(props.allStaff.map((s) => [s.id, s])),
    [props.allStaff]
  );

  const userQuals = useMemo(() => {
    const set = new Set<string>();
    for (const q of props.qualifications) {
      if (q.user_id === props.currentUserId) set.add(q.qualification);
    }
    return set;
  }, [props.qualifications, props.currentUserId]);

  // Eligible giveaways for the current user — qualified and no same-day
  // overlap with their existing assigned shifts.
  const eligibleGiveaways = useMemo(() => {
    return props.giveaways.filter((req) => {
      const s = shiftById.get(req.shift_id);
      if (!s) return false;
      if (!userQuals.has(s.role)) return false;
      const sameDay = props.allWeekShifts.filter(
        (other) =>
          other.user_id === props.currentUserId &&
          other.shift_date === s.shift_date &&
          other.id !== s.id
      );
      const overlaps = sameDay.some(
        (o) => o.start_time < s.end_time && s.start_time < o.end_time
      );
      return !overlaps;
    });
  }, [props.giveaways, props.allWeekShifts, props.currentUserId, shiftById, userQuals]);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function withGuard(p: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await p();
      if (!r.success) setError(r.error ?? "Failed");
    });
  }

  return (
    <div className="space-y-4 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Operations
        </p>
        <h1 className="text-xl font-bold text-white">Swaps</h1>
        <p className="mt-0.5 text-xs text-white/50">
          Direct swaps + open giveaways. Deadline 2 hours before shift start.
        </p>
      </header>

      <div className="flex gap-1 rounded-md border border-white/10 bg-surface-2 p-1 text-xs">
        {(["inbox", "mine", "marketplace"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded px-3 py-1.5 capitalize ${
              tab === t ? "bg-accent text-white" : "text-white/70"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      {tab === "inbox" && (
        <ul className="space-y-2">
          {props.incoming.length === 0 && (
            <p className="text-xs text-white/40">No incoming swap requests.</p>
          )}
          {props.incoming.map((req) => {
            const s = shiftById.get(req.shift_id);
            return (
              <li
                key={req.id}
                className="rounded-2xl border border-white/10 bg-surface-1 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {s ? (
                        <>
                          {s.shift_date} · {s.start_time.slice(0, 5)}–
                          {s.end_time.slice(0, 5)} · {s.role}
                        </>
                      ) : (
                        "Shift"
                      )}
                    </div>
                    <div className="text-xs text-white/60">
                      from {staffById.get(req.requested_by)?.full_name ?? "Unknown"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        withGuard(() => acceptSwapRequestAction(req.id))
                      }
                      disabled={pending}
                      className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        withGuard(() => declineSwapRequestAction(req.id))
                      }
                      disabled={pending}
                      className="rounded-md border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-white/70 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "mine" && (
        <div className="space-y-4">
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <ArrowLeftRight size={14} strokeWidth={1.5} /> Post a swap or giveaway
            </h2>
            <ul className="space-y-2">
              {props.myShifts.length === 0 && (
                <p className="text-xs text-white/40">No upcoming shifts.</p>
              )}
              {props.myShifts.map((s) => (
                <li
                  key={s.id}
                  className="rounded-2xl border border-white/10 bg-surface-1 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {s.shift_date} · {s.start_time.slice(0, 5)}–
                        {s.end_time.slice(0, 5)}
                      </div>
                      <div className="text-xs text-white/60">
                        {templateById.get(s.template_id)?.name ?? "Shift"} · {s.role}
                      </div>
                    </div>
                    <PostShiftActions shiftId={s.id} pending={pending} withGuard={withGuard} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-white">My pending requests</h2>
            <ul className="space-y-2">
              {props.outgoing.filter((r) => r.status === "pending").length === 0 && (
                <p className="text-xs text-white/40">Nothing pending.</p>
              )}
              {props.outgoing
                .filter((r) => r.status === "pending")
                .map((req) => {
                  const s = shiftById.get(req.shift_id);
                  return (
                    <li
                      key={req.id}
                      className="rounded-2xl border border-white/10 bg-surface-1 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-white">
                            {req.kind === "direct_swap" ? "Direct swap" : "Giveaway"}
                          </div>
                          <div className="text-xs text-white/60">
                            {s
                              ? `${s.shift_date} ${s.start_time.slice(0, 5)}`
                              : "Shift"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            withGuard(() => cancelSwapRequestAction(req.id))
                          }
                          disabled={pending}
                          className="rounded-md border border-white/10 bg-surface-2 px-2 py-1 text-xs text-white/70"
                        >
                          Cancel
                        </button>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>
        </div>
      )}

      {tab === "marketplace" && (
        <ul className="space-y-2">
          {eligibleGiveaways.length === 0 && (
            <p className="text-xs text-white/40">No eligible giveaways right now.</p>
          )}
          {eligibleGiveaways.map((req) => {
            const s = shiftById.get(req.shift_id);
            return (
              <li
                key={req.id}
                className="rounded-2xl border border-white/10 bg-surface-1 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1 text-sm font-semibold text-white">
                      <Gift size={12} strokeWidth={1.5} />
                      {s
                        ? `${s.shift_date} · ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)} · ${s.role}`
                        : "Shift"}
                    </div>
                    <div className="text-xs text-white/60">
                      from{" "}
                      {staffById.get(req.requested_by)?.full_name ?? "Unknown"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => withGuard(() => claimGiveawayAction(req.id))}
                    disabled={pending}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Claim
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PostShiftActions({
  shiftId,
  pending,
  withGuard,
}: {
  shiftId: string;
  pending: boolean;
  withGuard: (
    p: () => Promise<{ success: boolean; error?: string }>
  ) => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => withGuard(() => requestGiveawayAction({ shiftId }))}
        disabled={pending}
        className="rounded-md border border-white/10 bg-surface-2 px-2 py-1 text-xs text-white/70 disabled:opacity-50"
      >
        Give away
      </button>
    </div>
  );
}

