"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { deletePostAction } from "@/app/actions/posts";
import { formatRelativeTime } from "./relative-time";
import { linkify } from "./linkify";
import { YouTubeEmbed } from "./YouTubeEmbed";
import { PostImage } from "./PostImage";
import { LikeButton } from "./LikeButton";
import type { FeedPost } from "@/lib/types/posts";

export interface PostCardProps {
  post: FeedPost;
  /**
   * True when the signed-in user is allowed to remove this post.
   * Computed server-side: author OR manager/owner.
   */
  canDelete: boolean;
  onDeleted?: (postId: string) => void;
}

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  staff: { label: "Staff", className: "bg-white/10 text-white/70" },
  manager: { label: "Manager", className: "bg-accent/20 text-accent" },
  owner: { label: "Owner", className: "bg-amber-500/20 text-amber-200" },
};

export function PostCard({ post, canDelete, onDeleted }: PostCardProps) {
  const [isDeleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const author = post.author;

  const authorName =
    author.kind === "system"
      ? "Tigress"
      : author.displayName;

  const authorAvatarUrl =
    author.kind === "member" ? author.avatarUrl : null;

  const roleBadge =
    author.kind === "staff" ? ROLE_BADGE[author.role] : undefined;

  function handleDelete() {
    if (typeof window !== "undefined") {
      const ok = window.confirm("Delete this post? This can't be undone.");
      if (!ok) return;
    }
    startDelete(async () => {
      setDeleteError(null);
      const result = await deletePostAction(post.id);
      if (!result.success) {
        setDeleteError(result.error ?? "Failed to delete post");
        return;
      }
      onDeleted?.(post.id);
    });
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-surface-1 p-4">
      <header className="flex items-start gap-3">
        <Avatar name={authorName} src={authorAvatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">
              {authorName}
            </span>
            {roleBadge && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${roleBadge.className}`}
              >
                {roleBadge.label}
              </span>
            )}
            {author.kind === "system" && (
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/60">
                System
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/40">
            {formatRelativeTime(post.createdAt)}
          </p>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            aria-label="Delete post"
            className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-rose-300 disabled:opacity-50"
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        )}
      </header>

      <div className="mt-3 whitespace-pre-wrap break-words text-sm text-white/80">
        {linkify(post.body)}
      </div>

      {post.mediaType === "youtube" && post.mediaUrl && (
        <div className="mt-3">
          <YouTubeEmbed videoId={post.mediaUrl} />
        </div>
      )}
      {post.mediaType === "image" && post.mediaUrl && (
        <div className="mt-3">
          <PostImage url={post.mediaUrl} />
        </div>
      )}

      <footer className="mt-3 flex items-center gap-2">
        <LikeButton
          postId={post.id}
          initialLiked={post.likedByCurrentUser}
          initialCount={post.likeCount}
        />
      </footer>

      {deleteError && (
        <p className="mt-2 text-xs text-rose-300">{deleteError}</p>
      )}
    </article>
  );
}
