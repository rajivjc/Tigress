"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { createPostAction } from "@/app/actions/posts";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { YouTubeEmbed } from "./YouTubeEmbed";
import { PostImage } from "./PostImage";
import type { FeedPost } from "@/lib/types/posts";

interface PostComposerProps {
  onCreated?: (post: FeedPost) => void;
}

const MAX_LEN = 500;
const WARN_AT = 480;

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)(?:\?|#|$)/i;

function previewFor(mediaUrl: string):
  | { kind: "youtube"; id: string }
  | { kind: "image"; url: string }
  | null {
  const trimmed = mediaUrl.trim();
  if (!trimmed) return null;
  const ytId = extractYouTubeVideoId(trimmed);
  if (ytId) return { kind: "youtube", id: ytId };
  if (/^https:\/\//i.test(trimmed) && IMAGE_EXT.test(trimmed)) {
    return { kind: "image", url: trimmed };
  }
  return null;
}

export function PostComposer({ onCreated }: PostComposerProps) {
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startSubmit] = useTransition();

  const trimmedLen = body.trim().length;
  const disabled =
    isPending || trimmedLen === 0 || trimmedLen > MAX_LEN;

  const preview = previewFor(mediaUrl);
  const mediaProvided = mediaUrl.trim().length > 0;
  const mediaInvalid = mediaProvided && preview === null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startSubmit(async () => {
      const result = await createPostAction({
        body: body.trim(),
        mediaUrl: mediaUrl.trim() || null,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to post");
        return;
      }
      setBody("");
      setMediaUrl("");
      if (result.post) onCreated?.(result.post);
    });
  }

  const counterClass =
    trimmedLen > MAX_LEN
      ? "text-rose-300"
      : trimmedLen >= WARN_AT
        ? "text-amber-300"
        : "text-white/40";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-2xl border border-white/10 bg-surface-1 p-3"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share something with the club…"
        rows={3}
        maxLength={MAX_LEN + 50} /* let users paste and self-trim */
        className="w-full resize-none rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />

      <input
        type="url"
        value={mediaUrl}
        onChange={(e) => setMediaUrl(e.target.value)}
        placeholder="YouTube or image URL (optional)"
        className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-xs text-white outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />

      {preview?.kind === "youtube" && (
        <YouTubeEmbed videoId={preview.id} />
      )}
      {preview?.kind === "image" && <PostImage url={preview.url} />}
      {mediaInvalid && (
        <p className="text-xs text-amber-300">
          Not a YouTube or image URL — we&apos;ll reject this on submit.
        </p>
      )}

      {error && <p className="text-xs text-rose-300">{error}</p>}

      <div className="flex items-center justify-between">
        <span className={`text-[11px] ${counterClass}`}>
          {trimmedLen}/{MAX_LEN}
        </span>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 size={14} className="animate-spin" strokeWidth={2} />
          ) : (
            <Send size={14} strokeWidth={2} />
          )}
          Post
        </button>
      </div>
    </form>
  );
}
