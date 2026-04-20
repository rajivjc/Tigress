"use client";

import { Heart } from "lucide-react";
import { useState, useTransition } from "react";
import { toggleLikeAction } from "@/app/actions/posts";

interface LikeButtonProps {
  postId: string;
  initialLiked: boolean;
  initialCount: number;
}

export function LikeButton({
  postId,
  initialLiked,
  initialCount,
}: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    // Optimistic flip — revert in the transition's error branch.
    const nextLiked = !liked;
    const nextCount = nextLiked ? count + 1 : Math.max(0, count - 1);
    setLiked(nextLiked);
    setCount(nextCount);

    startTransition(async () => {
      const result = await toggleLikeAction(postId);
      if (!result.success) {
        setLiked(liked);
        setCount(count);
        return;
      }
      // Reconcile with the server's authoritative state in case a concurrent
      // like from another session bumped the count.
      setLiked(result.liked);
      setCount(result.newCount);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-pressed={liked}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5 disabled:opacity-60"
    >
      <Heart
        size={14}
        strokeWidth={1.5}
        className={liked ? "text-rose-400" : "text-white/50"}
        fill={liked ? "currentColor" : "none"}
      />
      <span className={liked ? "text-rose-200" : "text-white/60"}>
        {count}
      </span>
    </button>
  );
}
