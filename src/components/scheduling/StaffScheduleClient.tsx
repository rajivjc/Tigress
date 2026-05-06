"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { addDaysIso } from "@/scheduling/lib/materialize";
import type {
  ScheduleShift,
  ScheduleWeek,
  ShiftTemplate,
} from "@/scheduling/types";
import type { Staff } from "@/lib/types";

interface Props {
  currentUserId: string;
  weekStartDate: string;
  week: ScheduleWeek | null;
  shifts: ScheduleShift[];
  templates: ShiftTemplate[];
  staff: Staff[];
  canManage: boolean;
  todayWeekStart: string;
  previousWeek: string;
  nextWeek: string;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function StaffScheduleClient({
  currentUserId,
  weekStartDate,
  week,
  shifts,
  templates,
  staff,
  canManage,
  previousWeek,
  nextWeek,
}: Props) {
  const [scope, setScope] = useState<"mine" | "all">("mine");

  const templateById = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates]
  );
  const staffById = useMemo(
    () => new Map(staff.map((s) => [s.id, s])),
    [staff]
  );

  const filtered = scope === "mine"
    ? shifts.filter((s) => s.user_id === currentUserId)
    : shifts;

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleShift[]>();
    for (let i = 0; i < 7; i++) {
      map.set(addDaysIso(weekStartDate, i), []);
    }
    for (const s of filtered) {
      if (!map.has(s.shift_date)) {
        map.set(s.shift_date, []);
      }
      map.get(s.shift_date)!.push(s);
    }
    return map;
  }, [filtered, weekStartDate]);

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Operations
          </p>
          <h1 className="text-xl font-bold text-white">Schedule</h1>
          <p className="mt-0.5 text-xs text-white/50">
            Week of {weekStartDate}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/staff/schedule?week=${previousWeek}`}
            className="rounded-md border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
          >
            ← Prev
          </Link>
          <Link
            href={`/staff/schedule?week=${nextWeek}`}
            className="rounded-md border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
          >
            Next →
          </Link>
          <div className="flex overflow-hidden rounded-md border border-white/10">
            <button
              type="button"
              onClick={() => setScope("mine")}
              className={`px-3 py-1.5 text-xs ${
                scope === "mine"
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-white/70 hover:bg-white/5"
              }`}
            >
              My shifts
            </button>
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`px-3 py-1.5 text-xs ${
                scope === "all"
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-white/70 hover:bg-white/5"
              }`}
            >
              Full team
            </button>
          </div>
        </div>
      </header>

      {canManage && (
        <Link
          href="/manager/scheduling"
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface-1 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
        >
          <CalendarDays size={14} strokeWidth={1.5} />
          Open scheduling workspace
        </Link>
      )}

      {!week && (
        <EmptyState
          icon={CalendarDays}
          title="No published schedule for this week"
          description={
            canManage
              ? "Build a draft and publish to share with the team."
              : "The schedule for this week hasn't been published yet."
          }
        />
      )}

      {week && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from(byDay.entries()).map(([date, list], idx) => (
            <article
              key={date}
              className="space-y-2 rounded-2xl border border-white/10 bg-surface-1 p-4"
            >
              <header className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">
                  {DAY_LABELS[idx]} · {date.slice(5)}
                </h2>
                <span className="text-xs text-white/40">{list.length}</span>
              </header>
              {list.length === 0 ? (
                <p className="text-xs text-white/40">No shifts</p>
              ) : (
                <ul className="space-y-1.5">
                  {list
                    .slice()
                    .sort((a, b) =>
                      a.start_time.localeCompare(b.start_time)
                    )
                    .map((s) => {
                      const tpl = templateById.get(s.template_id);
                      const user = s.user_id ? staffById.get(s.user_id) : null;
                      const mine = s.user_id === currentUserId;
                      return (
                        <li
                          key={s.id}
                          className={`rounded-lg border px-3 py-2 text-xs ${
                            mine
                              ? "border-accent/40 bg-accent/10 text-white"
                              : "border-white/5 bg-surface-2/40 text-white/80"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {tpl?.name ?? "Shift"} · {s.role}
                            </span>
                            <span className="text-white/50">
                              {s.start_time.slice(0, 5)}–
                              {s.end_time.slice(0, 5)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-white/60">
                            <Users size={12} strokeWidth={1.5} />
                            <span>
                              {user?.full_name ?? "Unfilled"}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
