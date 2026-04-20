"use server";

// =============================================================================
// Social feed server actions (Session 20)
// =============================================================================
// Thin wrappers around the data layer. Each entry point follows the house
// pattern: authenticate → authorise → validate → data call → revalidate →
// return `{ success, error? }` (plus extra payload fields where useful).
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import {
  createPost,
  getPostRaw,
  listFeed,
  softDeletePost,
  toggleLike,
  type CurrentUser,
  type ListFeedResult,
} from "@/lib/data/posts";
import { getCurrentAuthUserId, getMemberProfile } from "@/lib/data/members";
import { getCurrentStaff } from "@/lib/data/staff";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FeedPost, PostMediaType } from "@/lib/types/posts";

// =============================================================================
// Resolved-user helpers
// =============================================================================

interface ResolvedUser {
  user: CurrentUser;
  role: "member" | "staff" | "manager" | "owner";
}

/**
 * Resolve the signed-in user as either a member or staff record. Used by
 * every feed action — the feed is shared across roles, so we can't assume
 * `getCurrentStaff()` and have to check both sides.
 *
 * Staff table is checked first (matching `AuthProvider` resolution order) so
 * a staff member who happens to have a matching member row wouldn't be
 * routed through the member branch.
 */
async function resolveCurrentUser(): Promise<ResolvedUser | null> {
  const staff = await getCurrentStaff();
  if (staff) {
    return {
      user: { kind: "staff", staffId: staff.staff.id },
      role: staff.role,
    };
  }

  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) return null;
  const member = await getMemberProfile(authUserId);
  if (!member) return null;
  return {
    user: { kind: "member", memberId: member.id },
    role: "member",
  };
}

function isManagerOrOwner(role: ResolvedUser["role"]): boolean {
  return role === "manager" || role === "owner";
}

// =============================================================================
// Media validation
// =============================================================================

const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png|gif|webp)(?:\?|#|$)/i;
const YOUTUBE_HOST_PATTERN =
  /^(https?:)?\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\b/i;

interface ResolvedMedia {
  ok: true;
  mediaType: PostMediaType;
  mediaUrl: string | null;
}

interface RejectedMedia {
  ok: false;
  error: string;
}

function resolveMedia(raw: string | null): ResolvedMedia | RejectedMedia {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: true, mediaType: "none", mediaUrl: null };
  }

  if (YOUTUBE_HOST_PATTERN.test(trimmed)) {
    const id = extractYouTubeVideoId(trimmed);
    if (!id) {
      return { ok: false, error: "Invalid YouTube URL" };
    }
    return { ok: true, mediaType: "youtube", mediaUrl: id };
  }

  if (/^https:\/\//i.test(trimmed) && IMAGE_EXTENSION_PATTERN.test(trimmed)) {
    return { ok: true, mediaType: "image", mediaUrl: trimmed };
  }

  return {
    ok: false,
    error:
      "Media URL must be a YouTube link or image URL (jpg, png, gif, webp)",
  };
}

// =============================================================================
// Audit logging (best-effort, never blocks the caller)
// =============================================================================

async function writePostAuditLog(
  action: "post.created" | "post.deleted",
  postId: string,
  actorId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: actorId,
      action,
      entity_type: "post",
      entity_id: postId,
      metadata,
    });
  } catch {
    /* best effort — audit failures must not break the user action */
  }
}

// =============================================================================
// listFeedAction — used by LoadMoreButton
// =============================================================================

export interface ListFeedActionResult extends ListFeedResult {
  error?: string;
}

export async function listFeedAction(
  beforeCursor?: string,
  limit?: number
): Promise<ListFeedActionResult> {
  const resolved = await resolveCurrentUser();
  if (!resolved) {
    return { posts: [], nextCursor: null, error: "Not signed in" };
  }

  const result = await listFeed({
    beforeCursor,
    limit,
    currentUser: resolved.user,
  });
  return { posts: result.posts, nextCursor: result.nextCursor };
}

// =============================================================================
// createPostAction
// =============================================================================

export interface CreatePostActionResult {
  success: boolean;
  post?: FeedPost;
  error?: string;
}

export async function createPostAction(formData: {
  body: string;
  mediaUrl?: string | null;
}): Promise<CreatePostActionResult> {
  const resolved = await resolveCurrentUser();
  if (!resolved || !resolved.user) {
    return { success: false, error: "Not signed in" };
  }

  const body = (formData.body ?? "").trim();
  if (body.length === 0) {
    return { success: false, error: "Post can't be empty" };
  }
  if (body.length > 500) {
    return { success: false, error: "Post can't exceed 500 characters" };
  }

  const media = resolveMedia(formData.mediaUrl ?? null);
  if (!media.ok) {
    return { success: false, error: media.error };
  }

  const authorKind = resolved.user.kind;
  const authorId =
    resolved.user.kind === "member"
      ? resolved.user.memberId
      : resolved.user.staffId;

  const insert = await createPost({
    authorKind,
    authorId,
    body,
    mediaType: media.mediaType,
    mediaUrl: media.mediaUrl,
  });

  if (!insert.success || !insert.id) {
    return { success: false, error: insert.error ?? "Failed to create post" };
  }

  await writePostAuditLog("post.created", insert.id, authorId, {
    postId: insert.id,
    authorKind,
    mediaType: media.mediaType,
  });

  revalidatePath("/feed");

  const { getPost } = await import("@/lib/data/posts");
  const post = await getPost(insert.id, resolved.user);
  return { success: true, post: post ?? undefined };
}

// =============================================================================
// deletePostAction
// =============================================================================

export async function deletePostAction(
  postId: string
): Promise<{ success: boolean; error?: string }> {
  const resolved = await resolveCurrentUser();
  if (!resolved || !resolved.user) {
    return { success: false, error: "Not signed in" };
  }

  const post = await getPostRaw(postId);
  if (!post) return { success: false, error: "Post not found" };
  if (post.deleted_at !== null) {
    return { success: false, error: "Post already deleted" };
  }

  const isAuthor =
    (resolved.user.kind === "member" &&
      post.author_member_id === resolved.user.memberId) ||
    (resolved.user.kind === "staff" &&
      post.author_staff_id === resolved.user.staffId);

  if (!isAuthor && !isManagerOrOwner(resolved.role)) {
    return { success: false, error: "You don't have permission to delete this post" };
  }

  const actorId =
    resolved.user.kind === "member"
      ? resolved.user.memberId
      : resolved.user.staffId;

  const result = await softDeletePost({
    postId,
    actorKind: resolved.user.kind,
    actorId,
  });

  if (!result.success) {
    return { success: false, error: result.error ?? "Failed to delete post" };
  }

  const originalAuthorKind: "member" | "staff" | "system" = post.system_generated
    ? "system"
    : post.author_member_id
      ? "member"
      : "staff";

  await writePostAuditLog("post.deleted", postId, actorId, {
    postId,
    wasAuthor: isAuthor,
    originalAuthorKind,
  });

  revalidatePath("/feed");
  return { success: true };
}

// =============================================================================
// toggleLikeAction
// =============================================================================

export interface ToggleLikeActionResult {
  success: boolean;
  liked: boolean;
  newCount: number;
  error?: string;
}

export async function toggleLikeAction(
  postId: string
): Promise<ToggleLikeActionResult> {
  const resolved = await resolveCurrentUser();
  if (!resolved || !resolved.user) {
    return {
      success: false,
      liked: false,
      newCount: 0,
      error: "Not signed in",
    };
  }

  const likerKind = resolved.user.kind;
  const likerId =
    resolved.user.kind === "member"
      ? resolved.user.memberId
      : resolved.user.staffId;

  const result = await toggleLike({ postId, likerKind, likerId });
  return result;
}
