"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "@/app/actions/profile";
import type { Member } from "@/lib/types";

interface EditProfileFormProps {
  member: Member;
}

export function EditProfileForm({ member }: EditProfileFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(member.full_name);
  const [phone, setPhone] = useState(member.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(member.avatar_url ?? "");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updateProfileAction({
        full_name: fullName,
        phone,
        avatar_url: avatarUrl,
      });
      if (!result.success) {
        setMessage({
          type: "error",
          text: result.error ?? "Failed to save",
        });
        return;
      }
      setMessage({ type: "success", text: "Profile updated" });
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="full_name"
          className="mb-1 block text-xs uppercase tracking-wider text-white/40"
        >
          Full name
        </label>
        <input
          id="full_name"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </div>

      <div>
        <label
          htmlFor="email"
          className="mb-1 block text-xs uppercase tracking-wider text-white/40"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          value={member.email}
          disabled
          className="w-full cursor-not-allowed rounded-lg border border-white/10 bg-surface-1/80 px-3 py-2 text-sm text-white/50"
        />
        <p className="mt-1 text-[11px] text-white/40">
          Email is tied to your login and cannot be changed here.
        </p>
      </div>

      <div>
        <label
          htmlFor="phone"
          className="mb-1 block text-xs uppercase tracking-wider text-white/40"
        >
          Phone
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+65 9123 4567"
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </div>

      <div>
        <label
          htmlFor="avatar_url"
          className="mb-1 block text-xs uppercase tracking-wider text-white/40"
        >
          Avatar URL
        </label>
        <input
          id="avatar_url"
          type="url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </div>

      {message && (
        <p
          className={`rounded-md border p-2 text-xs ${
            message.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-accent/90 disabled:opacity-50 active:scale-[0.98]"
      >
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
