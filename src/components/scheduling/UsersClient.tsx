"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { setUserQualificationsAction } from "@/scheduling/actions/qualifications";
import {
  endFtAssignmentAction,
  upsertFtAssignmentAction,
} from "@/scheduling/actions/ft-assignments";
import type {
  FtAssignment,
  Qualification,
  ShiftTemplate,
  UserQualification,
} from "@/scheduling/types";
import { QUALIFICATIONS } from "@/scheduling/types";
import type { Staff } from "@/lib/types";

interface Props {
  staff: Staff[];
  qualifications: UserQualification[];
  ftAssignments: FtAssignment[];
  templates: ShiftTemplate[];
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function UsersClient({
  staff,
  qualifications,
  ftAssignments,
  templates,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = () => router.refresh();

  const qualsByUser = new Map<string, Qualification[]>();
  for (const q of qualifications) {
    const list = qualsByUser.get(q.user_id) ?? [];
    list.push(q.qualification);
    qualsByUser.set(q.user_id, list);
  }

  const ftByUser = new Map<string, FtAssignment[]>();
  for (const f of ftAssignments) {
    const list = ftByUser.get(f.user_id) ?? [];
    list.push(f);
    ftByUser.set(f.user_id, list);
  }

  const toggleQual = (userId: string, q: Qualification) => {
    const current = qualsByUser.get(userId) ?? [];
    const next = current.includes(q)
      ? current.filter((x) => x !== q)
      : [...current, q];
    startTransition(async () => {
      const r = await setUserQualificationsAction(userId, next);
      if (!r.success) setError(r.error ?? "Failed");
      else refresh();
    });
  };

  const handleEnd = (id: string) => {
    if (!window.confirm("End this FT assignment today?")) return;
    const today = new Date().toISOString().slice(0, 10);
    startTransition(async () => {
      const r = await endFtAssignmentAction(id, today);
      if (!r.success) setError(r.error ?? "Failed");
      else refresh();
    });
  };

  return (
    <div className="space-y-4 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Manager
        </p>
        <h1 className="text-xl font-bold text-white">Staff users</h1>
        <p className="mt-0.5 text-xs text-white/50">
          Edit qualifications and FT standing assignments.
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {staff.map((s) => (
          <UserCard
            key={s.id}
            staff={s}
            qualifications={qualsByUser.get(s.id) ?? []}
            ftAssignments={ftByUser.get(s.id) ?? []}
            templates={templates}
            disabled={pending}
            onToggleQual={(q) => toggleQual(s.id, q)}
            onEndFt={handleEnd}
            onAddedFt={refresh}
            onError={setError}
          />
        ))}
      </div>
    </div>
  );
}

interface UserCardProps {
  staff: Staff;
  qualifications: Qualification[];
  ftAssignments: FtAssignment[];
  templates: ShiftTemplate[];
  disabled: boolean;
  onToggleQual: (q: Qualification) => void;
  onEndFt: (id: string) => void;
  onAddedFt: () => void;
  onError: (e: string) => void;
}

function UserCard({
  staff,
  qualifications,
  ftAssignments,
  templates,
  disabled,
  onToggleQual,
  onEndFt,
  onAddedFt,
  onError,
}: UserCardProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [tplId, setTplId] = useState(templates[0]?.id ?? "");
  const [dow, setDow] = useState(0);
  const [role, setRole] = useState<Qualification>("bartender");
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [pending, startTransition] = useTransition();

  const handleAdd = () => {
    if (!tplId) {
      onError("Pick a template");
      return;
    }
    startTransition(async () => {
      const r = await upsertFtAssignmentAction({
        user_id: staff.id,
        template_id: tplId,
        day_of_week: dow,
        role,
        effective_from: from,
        effective_until: null,
      });
      if (!r.success) onError(r.error ?? "Failed");
      else {
        setShowAdd(false);
        onAddedFt();
      }
    });
  };

  return (
    <article className="space-y-3 rounded-2xl border border-white/10 bg-surface-1 p-4">
      <header>
        <h2 className="text-base font-semibold text-white">{staff.full_name}</h2>
        <p className="text-xs text-white/50">
          {staff.role} · {staff.employment_type}
        </p>
      </header>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
          Qualifications
        </p>
        <div className="flex flex-wrap gap-1">
          {QUALIFICATIONS.map((q) => {
            const active = qualifications.includes(q);
            return (
              <button
                key={q}
                type="button"
                onClick={() => onToggleQual(q)}
                disabled={disabled}
                className={`rounded border px-2 py-0.5 text-xs capitalize ${
                  active
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-white/10 bg-surface-2 text-white/60"
                }`}
              >
                {q}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <header className="mb-1 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-white/40">
            FT standing assignments
          </p>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-1 rounded border border-white/10 bg-surface-2 px-2 py-0.5 text-xs text-white/70"
          >
            <Plus size={10} strokeWidth={1.5} />
            Add
          </button>
        </header>

        {showAdd && (
          <div className="mb-2 space-y-1.5 rounded-lg border border-accent/30 bg-accent/5 p-2 text-xs">
            <div className="flex flex-wrap items-center gap-1">
              <select
                value={tplId}
                onChange={(e) => setTplId(e.target.value)}
                className="rounded bg-surface-2 px-2 py-1 text-white"
              >
                {templates
                  .filter((t) => t.is_active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
              <select
                value={dow}
                onChange={(e) => setDow(Number.parseInt(e.target.value, 10))}
                className="rounded bg-surface-2 px-2 py-1 text-white"
              >
                {DAY_LABELS.map((l, i) => (
                  <option key={i} value={i}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Qualification)}
                className="rounded bg-surface-2 px-2 py-1 text-white capitalize"
              >
                {QUALIFICATIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded bg-surface-2 px-2 py-1 text-white"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={pending}
                className="rounded bg-accent px-2 py-1 font-semibold text-white"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {ftAssignments.length === 0 ? (
          <p className="text-xs text-white/40">No standing assignments</p>
        ) : (
          <ul className="space-y-1">
            {ftAssignments.map((f) => {
              const tpl = templates.find((t) => t.id === f.template_id);
              return (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-surface-2/40 px-2 py-1 text-xs"
                >
                  <span>
                    {tpl?.name ?? "—"} · {DAY_LABELS[f.day_of_week]} · {f.role}
                    {" "}
                    <span className="text-white/40">
                      ({f.effective_from}
                      {f.effective_until ? ` → ${f.effective_until}` : ""})
                    </span>
                  </span>
                  {!f.effective_until && (
                    <button
                      type="button"
                      onClick={() => onEndFt(f.id)}
                      className="rounded p-1 text-white/40 hover:bg-white/5"
                      aria-label="End assignment"
                    >
                      <Trash2 size={10} strokeWidth={1.5} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}
