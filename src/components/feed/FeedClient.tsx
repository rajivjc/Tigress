"use client";

// =============================================================================
// FeedClient
// =============================================================================
// The interactive shell for /feed. Holds the post list, composer, and "Load
// more" button in a single client component so creations/deletes update the
// list locally without a full server round-trip.
// =============================================================================

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { PostCard } from "./PostCard";
import { PostComposer } from "./PostComposer";
import { listFeedAction } from "@/app/actions/posts";
import type { FeedPost } from "@/lib/types/posts";

export interface FeedClientProps {
  initialPosts: FeedPost[];
  initialCursor: string | null;
  currentRole: "member" | "staff" | "manager" | "owner";
  /**
   * Primary key of the signed-in user scoped to the `author` shape we store
   * on the row (member_id for members, staff_id for staff). Used to decide
   * which posts the user can delete.
   */
  currentUserKey: { kind: "member" | "staff"; id: string };
}

export function FeedClient({
  initialPosts,
  initialCursor,
  currentRole,
  currentUserKey,
}: FeedClientProps) {
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [isLoadingMore, startLoadMore] = useTransition();

  const canModerate = currentRole === "manager" || currentRole === "owner";

  function canDelete(post: FeedPost): boolean {
    if (canModerate) return true;
    if (post.author.kind === "system") return false;
    return (
      post.author.kind === currentUserKey.kind &&
      post.author.id === currentUserKey.id
    );
  }

  function handleCreated(post: FeedPost) {
    setPosts((prev) => [post, ...prev]);
  }

  function handleDeleted(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  function handleLoadMore() {
    if (!cursor) return;
    startLoadMore(async () => {
      setLoadMoreError(null);
      const result = await listFeedAction(cursor);
      if (result.error) {
        setLoadMoreError(result.error);
        return;
      }
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const fresh = result.posts.filter((p) => !seen.has(p.id));
        return [...prev, ...fresh];
      });
      setCursor(result.nextCursor);
    });
  }

  return (
    <div className="space-y-4 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Community
        </p>
        <h1 className="text-xl font-bold text-white">Feed</h1>
        <p className="mt-0.5 text-xs text-white/50">
          What&apos;s happening at the club.
        </p>
      </header>

      <PostComposer onCreated={handleCreated} />

      {posts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-surface-1 p-6 text-center text-sm text-white/50">
          Nothing posted yet. Be the first.
        </div>
      )}

      <ul className="space-y-3">
        {posts.map((post) => (
          <li key={post.id}>
            <PostCard
              post={post}
              canDelete={canDelete(post)}
              onDeleted={handleDeleted}
            />
          </li>
        ))}
      </ul>

      {cursor && (
        <div className="flex flex-col items-center gap-1 py-4">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-surface-2 px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            {isLoadingMore ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Loading…
              </>
            ) : (
              "Load more"
            )}
          </button>
          {loadMoreError && (
            <p className="text-[11px] text-rose-300">{loadMoreError}</p>
          )}
        </div>
      )}
    </div>
  );
}
