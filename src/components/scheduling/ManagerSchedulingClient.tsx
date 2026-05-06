"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  Copy,
  Settings2,
  UserPlus,
  X,
} from "lucide-react";
import {
  addShiftAction,
  archiveWeekAction,
  assignUserToShiftAction,
  copyFromPreviousWeekAction,
  createWeekAction,
  publishWeekAction,
  removeShiftAction,
  unassignUserFromShiftAction,
  unpublishWeekAction,
} from "@/scheduling/actions/weeks";
import { validateWeekCoverage } from "@/scheduling/lib/coverage";
import { addDaysIso } from "@/scheduling/lib/materialize";
import { isUserAvailableForShift, timeRangesOverlap } from "@/scheduling/lib/availability-check";
import type {
  AvailabilityBlock,
  FtAssignment,
  Qualification,
  ScheduleShift,
  ScheduleWeek,
  ShiftTemplate,
  TemplateDayCoverage,
  UserQualification,
} from "@/scheduling/types";
import { QUALIFICATIONS } from "@/scheduling/types";
import type { Staff } from "@/lib/types";

interface Props {
  week: ScheduleWeek | null;
  weekStartDate: string;
  shifts: ScheduleShift[];
  templates: ShiftTemplate[];
  dayCoverage: TemplateDayCoverage[];
  staff: Staff[];
  qualifications: UserQualification[];
  ftAssignments: FtAssignment[];
  availability: AvailabilityBlock[];
  previousWeek: string;
  nextWeek: string;
  previousWeekExists: boolean;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ManagerSchedulingClient(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const [assignTarget, setAssignTarget] = useState<ScheduleShift | null>(null);

  const coverage = useMemo(
    () =>
      validateWeekCoverage({
        shifts: props.shifts,
        dayCoverage: props.dayCoverage,
      }),
    [props.shifts, props.dayCoverage]
  );

  const templateById = useMemo(
    () => new Map(props.templates.map((t) => [t.id, t])),
    [props.templates]
  );
  const staffById = useMemo(
    () => new Map(props.staff.map((s) => [s.id, s])),
    [props.staff]
  );
  const qualsByUser = useMemo(() => {
    const map = new Map<string, Qualification[]>();
    for (const q of props.qualifications) {
      const list = map.get(q.user_id) ?? [];
      list.push(q.qualification);
      map.set(q.user_id, list);
    }
    return map;
  }, [props.qualifications]);

  const isPublished = props.week?.status === "published";
  const isArchived = props.week?.status === "archived";
  const readOnly = isArchived;

  const refresh = () => router.refresh();

  const handleCreateWeek = () => {
    setError(null);
    startTransition(async () => {
      const r = await createWeekAction(props.weekStartDate);
      if (!r.success) setError(r.error ?? "Failed to create");
      else refresh();
    });
  };

  const handleCopyFromPrev = () => {
    setError(null);
    startTransition(async () => {
      const r = await copyFromPreviousWeekAction(props.weekStartDate);
      if (!r.success) setError(r.error ?? "Failed to copy");
      else refresh();
    });
  };

  const handlePublish = (note?: string) => {
    if (!props.week) return;
    setError(null);
    startTransition(async () => {
      const r = await publishWeekAction({
        weekId: props.week!.id,
        overrideNote: note ?? null,
      });
      if (r.success) {
        setOverrideOpen(false);
        setOverrideNote("");
        refresh();
      } else if (r.requiresOverride) {
        setOverrideOpen(true);
      } else {
        setError(r.error ?? "Failed to publish");
      }
    });
  };

  const handleUnpublish = () => {
    if (!props.week) return;
    setError(null);
    startTransition(async () => {
      const r = await unpublishWeekAction(props.week!.id);
      if (!r.success) setError(r.error ?? "Failed");
      else refresh();
    });
  };

  const handleArchive = () => {
    if (!props.week) return;
    if (!window.confirm("Archive this week?")) return;
    startTransition(async () => {
      const r = await archiveWeekAction(props.week!.id);
      if (!r.success) setError(r.error ?? "Failed");
      else refresh();
    });
  };

  const handleAddSlot = (
    templateId: string,
    shiftDate: string,
    role: Qualification
  ) => {
    if (!props.week) return;
    setError(null);
    const tpl = templateById.get(templateId);
    if (!tpl) return;
    startTransition(async () => {
      const r = await addShiftAction({
        weekId: props.week!.id,
        templateId,
        shiftDate,
        role,
        startTime: tpl.start_time,
        endTime: tpl.end_time,
      });
      if (!r.success) setError(r.error ?? "Failed");
      else refresh();
    });
  };

  const handleRemove = (shiftId: string) => {
    if (!window.confirm("Remove this shift?")) return;
    startTransition(async () => {
      const r = await removeShiftAction(shiftId);
      if (!r.success) setError(r.error ?? "Failed");
      else refresh();
    });
  };

  const handleUnassign = (shiftId: string) => {
    startTransition(async () => {
      const r = await unassignUserFromShiftAction(shiftId);
      if (!r.success) setError(r.error ?? "Failed");
      else refresh();
    });
  };

  const handleAssign = (shiftId: string, userId: string) => {
    startTransition(async () => {
      const r = await assignUserToShiftAction(shiftId, userId);
      if (!r.success) {
        setError(r.error ?? "Failed");
      } else {
        setAssignTarget(null);
        refresh();
      }
    });
  };

  // Group shifts by date for rendering.
  const shiftsByDate = useMemo(() => {
    const map = new Map<string, ScheduleShift[]>();
    for (let i = 0; i < 7; i++) {
      map.set(addDaysIso(props.weekStartDate, i), []);
    }
    for (const s of props.shifts) {
      if (!map.has(s.shift_date)) map.set(s.shift_date, []);
      map.get(s.shift_date)!.push(s);
    }
    return map;
  }, [props.shifts, props.weekStartDate]);

  const coverageBadge = coverage.ok ? (
    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
      Coverage OK
    </span>
  ) : (
    <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-rose-300">
      {coverage.gaps.length} gap{coverage.gaps.length === 1 ? "" : "s"}
    </span>
  );

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Manager
          </p>
          <h1 className="text-xl font-bold text-white">Scheduling</h1>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-white/50">
            Week of {props.weekStartDate}
            {props.week && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/60">
                {props.week.status}
              </span>
            )}
            {props.week && coverageBadge}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/manager/scheduling?week=${props.previousWeek}`}
            className="rounded-md border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-white/70"
          >
            ← Prev
          </Link>
          <Link
            href={`/manager/scheduling?week=${props.nextWeek}`}
            className="rounded-md border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-white/70"
          >
            Next →
          </Link>
          <Link
            href="/manager/settings/shift-templates"
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface-1 px-3 py-1.5 text-xs text-white/70"
          >
            <Settings2 size={14} strokeWidth={1.5} />
            Templates
          </Link>
        </div>
      </header>

      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      {!props.week && (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-surface-1 p-6">
          <p className="text-sm text-white/70">
            No draft yet for this week. Create from the FT standing template
            {props.previousWeekExists ? " or copy from the previous week" : ""}.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCreateWeek}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
            >
              <CalendarPlus size={14} strokeWidth={1.5} />
              Create week
            </button>
            {props.previousWeekExists && (
              <button
                type="button"
                onClick={handleCopyFromPrev}
                disabled={isPending}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-white/80"
              >
                <Copy size={14} strokeWidth={1.5} />
                Copy from previous
              </button>
            )}
          </div>
        </div>
      )}

      {props.week && (
        <>
          <div className="flex flex-wrap gap-2">
            {!isPublished && !readOnly && (
              <button
                type="button"
                onClick={() => handlePublish()}
                disabled={isPending}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white"
              >
                Publish
              </button>
            )}
            {isPublished && (
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={isPending}
                className="rounded-md border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-white/80"
              >
                Unpublish
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={handleArchive}
                disabled={isPending}
                className="rounded-md border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-white/60"
              >
                Archive
              </button>
            )}
          </div>

          {overrideOpen && (
            <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm text-amber-300">
                Coverage gaps detected ({coverage.gaps.length}). Provide an
                override note to publish anyway.
              </p>
              <ul className="space-y-1 text-xs text-amber-200/70">
                {coverage.gaps.slice(0, 6).map((g, i) => (
                  <li key={i}>
                    {g.shift_date} · {g.role}: {g.assigned}/{g.required}
                  </li>
                ))}
                {coverage.gaps.length > 6 && (
                  <li>… and {coverage.gaps.length - 6} more</li>
                )}
              </ul>
              <textarea
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                placeholder="Why is publishing without full coverage OK?"
                className="w-full rounded-md border border-white/10 bg-surface-2 p-2 text-sm text-white"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handlePublish(overrideNote)}
                  disabled={isPending || !overrideNote.trim()}
                  className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-60"
                >
                  Publish with note
                </button>
                <button
                  type="button"
                  onClick={() => setOverrideOpen(false)}
                  className="rounded-md border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-white/70"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Array.from(shiftsByDate.entries()).map(([date, list], idx) => (
              <DayCard
                key={date}
                date={date}
                dayLabel={DAY_LABELS[idx]}
                shifts={list}
                templates={props.templates}
                templateById={templateById}
                dayCoverage={props.dayCoverage}
                staffById={staffById}
                readOnly={readOnly}
                onAddSlot={handleAddSlot}
                onAssign={(s) => setAssignTarget(s)}
                onUnassign={handleUnassign}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </>
      )}

      {assignTarget && (
        <AssignModal
          shift={assignTarget}
          allShifts={props.shifts}
          staff={props.staff}
          qualsByUser={qualsByUser}
          ftAssignments={props.ftAssignments}
          availability={props.availability}
          onClose={() => setAssignTarget(null)}
          onAssign={(uid) => handleAssign(assignTarget.id, uid)}
        />
      )}
    </div>
  );
}

interface DayCardProps {
  date: string;
  dayLabel: string;
  shifts: ScheduleShift[];
  templates: ShiftTemplate[];
  templateById: Map<string, ShiftTemplate>;
  dayCoverage: TemplateDayCoverage[];
  staffById: Map<string, Staff>;
  readOnly: boolean;
  onAddSlot: (
    templateId: string,
    shiftDate: string,
    role: Qualification
  ) => void;
  onAssign: (shift: ScheduleShift) => void;
  onUnassign: (shiftId: string) => void;
  onRemove: (shiftId: string) => void;
}

function DayCard({
  date,
  dayLabel,
  shifts,
  templates,
  templateById,
  dayCoverage,
  staffById,
  readOnly,
  onAddSlot,
  onAssign,
  onUnassign,
  onRemove,
}: DayCardProps) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7;

  // Templates active on this day-of-week.
  const dayTemplates = templates.filter((t) =>
    t.is_active &&
    dayCoverage.some(
      (dc) => dc.template_id === t.id && dc.day_of_week === dow
    )
  );

  return (
    <article className="space-y-2 rounded-2xl border border-white/10 bg-surface-1 p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">
          {dayLabel} · {date.slice(5)}
        </h2>
        <span className="text-xs text-white/40">{shifts.length}</span>
      </header>

      {shifts.length === 0 ? (
        <p className="text-xs text-white/40">No shifts</p>
      ) : (
        <ul className="space-y-1.5">
          {shifts
            .slice()
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .map((s) => {
              const tpl = templateById.get(s.template_id);
              const user = s.user_id ? staffById.get(s.user_id) : null;
              return (
                <li
                  key={s.id}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    s.user_id
                      ? "border-white/10 bg-surface-2/40"
                      : "border-rose-500/30 bg-rose-500/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white">
                      {tpl?.name ?? "Shift"} · {s.role}
                    </span>
                    <span className="text-white/50">
                      {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-1 text-white/60">
                    <span>{user?.full_name ?? "Unfilled"}</span>
                    {!readOnly && (
                      <span className="flex items-center gap-1">
                        {s.user_id ? (
                          <button
                            type="button"
                            onClick={() => onUnassign(s.id)}
                            className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/5"
                          >
                            Unassign
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAssign(s)}
                            className="inline-flex items-center gap-1 rounded border border-accent/40 px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent/10"
                          >
                            <UserPlus size={10} strokeWidth={1.5} />
                            Assign
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemove(s.id)}
                          className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/40 hover:bg-white/5"
                        >
                          <X size={10} strokeWidth={1.5} />
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
      )}

      {!readOnly && dayTemplates.length > 0 && (
        <div className="space-y-1 border-t border-white/5 pt-2">
          <p className="text-[10px] uppercase tracking-wider text-white/40">
            Add slot
          </p>
          <div className="flex flex-wrap gap-1">
            {dayTemplates.flatMap((t) =>
              QUALIFICATIONS.map((role) => (
                <button
                  key={`${t.id}-${role}`}
                  type="button"
                  onClick={() => onAddSlot(t.id, date, role)}
                  className="rounded border border-white/10 bg-surface-2 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/5"
                >
                  + {t.name} {role}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </article>
  );
}

interface AssignModalProps {
  shift: ScheduleShift;
  allShifts: ScheduleShift[];
  staff: Staff[];
  qualsByUser: Map<string, Qualification[]>;
  ftAssignments: FtAssignment[];
  availability: AvailabilityBlock[];
  onClose: () => void;
  onAssign: (userId: string) => void;
}

function AssignModal({
  shift,
  allShifts,
  staff,
  qualsByUser,
  ftAssignments,
  availability,
  onClose,
  onAssign,
}: AssignModalProps) {
  // Filter: qualified for the role, available, and not double-booked on the
  // same date with overlapping times.
  const eligible = staff.filter((s) => {
    const q = qualsByUser.get(s.id) ?? [];
    if (!q.includes(shift.role)) return false;
    const employment =
      s.employment_type === "full_time" ? "full_time" : "part_time";
    const userFt = ftAssignments.filter((f) => f.user_id === s.id);
    const userAv = availability.filter((a) => a.user_id === s.id);
    const check = isUserAvailableForShift({
      user_employment_type: employment,
      shift,
      availabilityBlocks: userAv,
      ftAssignments: userFt,
    });
    if (!check.ok) return false;
    const sameDay = allShifts.filter(
      (other) =>
        other.user_id === s.id &&
        other.shift_date === shift.shift_date &&
        other.id !== shift.id
    );
    for (const other of sameDay) {
      if (
        timeRangesOverlap(
          shift.start_time,
          shift.end_time,
          other.start_time,
          other.end_time
        )
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-surface-1 p-4 md:rounded-2xl">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            Assign {shift.role} on {shift.shift_date}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-white/60 hover:bg-white/5"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>
        {eligible.length === 0 ? (
          <p className="text-sm text-white/60">
            No eligible staff. Check qualifications and availability.
          </p>
        ) : (
          <ul className="space-y-1">
            {eligible.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onAssign(s.id)}
                  className="flex w-full items-center justify-between rounded-md border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white hover:bg-white/5"
                >
                  <span>{s.full_name}</span>
                  <span className="text-xs text-white/40">
                    {s.employment_type === "full_time" ? "FT" : "PT"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
