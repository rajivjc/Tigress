"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Plus, Trash2 } from "lucide-react";
import {
  clearAvailabilityAction,
  submitAvailabilityAction,
} from "@/scheduling/actions/availability";
import { addDaysIso } from "@/scheduling/lib/materialize";
import type { AvailabilityBlock } from "@/scheduling/types";

interface Props {
  currentWeek: string;
  nextWeek: string;
  thisWeekBlocks: AvailabilityBlock[];
  nextWeekBlocks: AvailabilityBlock[];
  employmentType: "full_time" | "part_time";
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface DraftBlock {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

function fromBlocks(blocks: AvailabilityBlock[]): DraftBlock[] {
  return blocks.map((b) => ({
    id: b.id,
    day_of_week: b.day_of_week,
    start_time: b.start_time.slice(0, 5),
    end_time: b.end_time.slice(0, 5),
  }));
}

export function AvailabilityClient({
  currentWeek,
  nextWeek,
  thisWeekBlocks,
  nextWeekBlocks,
  employmentType,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"current" | "next">("next");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [thisDraft, setThisDraft] = useState<DraftBlock[]>(
    fromBlocks(thisWeekBlocks)
  );
  const [nextDraft, setNextDraft] = useState<DraftBlock[]>(
    fromBlocks(nextWeekBlocks)
  );

  const isFullTime = employmentType === "full_time";
  const week = tab === "current" ? currentWeek : nextWeek;
  const draft = tab === "current" ? thisDraft : nextDraft;
  const setDraft = tab === "current" ? setThisDraft : setNextDraft;

  const handleAdd = (dow: number) => {
    setDraft((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        day_of_week: dow,
        start_time: "17:00",
        end_time: "23:00",
      },
    ]);
  };

  const handleRemove = (id: string) => {
    setDraft((prev) => prev.filter((b) => b.id !== id));
  };

  const handleEdit = (id: string, field: "start_time" | "end_time", value: string) => {
    setDraft((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: value } : b))
    );
  };

  const handleSubmit = () => {
    setError(null);
    setSuccess(null);
    // Validate locally before round-trip.
    for (const b of draft) {
      if (b.end_time <= b.start_time) {
        setError("End time must be after start time on every block");
        return;
      }
    }
    startTransition(async () => {
      const r = await submitAvailabilityAction({
        weekStartDate: week,
        blocks: draft.map((b) => ({
          day_of_week: b.day_of_week,
          start_time: b.start_time + ":00",
          end_time: b.end_time + ":00",
        })),
      });
      if (r.success) {
        setSuccess(
          r.flaggedLate
            ? "Submitted (past deadline — flagged for manager)"
            : "Saved"
        );
        router.refresh();
      } else {
        setError(r.error ?? "Failed to save");
      }
    });
  };

  const handleClear = () => {
    if (!window.confirm("Clear all availability for this week?")) return;
    startTransition(async () => {
      const r = await clearAvailabilityAction(week);
      if (r.success) {
        setDraft([]);
        setSuccess("Cleared");
        router.refresh();
      } else {
        setError(r.error ?? "Failed");
      }
    });
  };

  return (
    <div className="space-y-4 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Operations
        </p>
        <h1 className="text-xl font-bold text-white">Availability</h1>
        <p className="mt-0.5 text-xs text-white/50">
          PT availability for upcoming weeks. Default deadline is Friday 18:00
          for the following week.
        </p>
      </header>

      {isFullTime && (
        <div className="rounded-2xl border border-white/10 bg-surface-1 p-4 text-sm text-white/70">
          You&apos;re full-time — your standing FT template covers your shifts.
          PT availability blocks are not required.
        </div>
      )}

      <div className="flex overflow-hidden rounded-md border border-white/10 text-xs">
        <button
          type="button"
          onClick={() => setTab("current")}
          className={`flex-1 px-3 py-2 ${
            tab === "current"
              ? "bg-accent text-white"
              : "bg-surface-2 text-white/70"
          }`}
        >
          This week ({currentWeek})
        </button>
        <button
          type="button"
          onClick={() => setTab("next")}
          className={`flex-1 px-3 py-2 ${
            tab === "next"
              ? "bg-accent text-white"
              : "bg-surface-2 text-white/70"
          }`}
        >
          Next week ({nextWeek})
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}
      {success && (
        <p className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          <Check size={14} strokeWidth={1.5} />
          {success}
        </p>
      )}

      <div className="space-y-3">
        {DAY_LABELS.map((label, dow) => {
          const dayBlocks = draft.filter((b) => b.day_of_week === dow);
          const date = addDaysIso(week, dow);
          return (
            <article
              key={dow}
              className="space-y-2 rounded-2xl border border-white/10 bg-surface-1 p-4"
            >
              <header className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">
                  {label}{" "}
                  <span className="text-xs text-white/40">{date.slice(5)}</span>
                </h2>
                {!isFullTime && (
                  <button
                    type="button"
                    onClick={() => handleAdd(dow)}
                    className="inline-flex items-center gap-1 rounded border border-white/10 bg-surface-2 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
                  >
                    <Plus size={12} strokeWidth={1.5} />
                    Add block
                  </button>
                )}
              </header>
              {dayBlocks.length === 0 ? (
                <p className="text-xs text-white/40">Not available</p>
              ) : (
                <ul className="space-y-1">
                  {dayBlocks.map((b) => (
                    <li
                      key={b.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-white/5 bg-surface-2/40 px-2 py-1.5 text-xs"
                    >
                      <input
                        type="time"
                        value={b.start_time}
                        onChange={(e) =>
                          handleEdit(b.id, "start_time", e.target.value)
                        }
                        disabled={isFullTime}
                        className="rounded bg-surface-2 px-2 py-1 text-white"
                      />
                      <span className="text-white/40">–</span>
                      <input
                        type="time"
                        value={b.end_time}
                        onChange={(e) =>
                          handleEdit(b.id, "end_time", e.target.value)
                        }
                        disabled={isFullTime}
                        className="rounded bg-surface-2 px-2 py-1 text-white"
                      />
                      {!isFullTime && (
                        <button
                          type="button"
                          onClick={() => handleRemove(b.id)}
                          className="ml-auto rounded p-1 text-white/40 hover:bg-white/5"
                          aria-label="Remove block"
                        >
                          <Trash2 size={12} strokeWidth={1.5} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>

      {!isFullTime && (
        <div className="sticky bottom-20 z-10 flex gap-2 md:bottom-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="flex-1 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white shadow-lg disabled:opacity-60"
          >
            <CalendarClock
              size={14}
              strokeWidth={1.5}
              className="mr-1 inline"
            />
            Save availability
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={pending}
            className="rounded-md border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white/70"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
