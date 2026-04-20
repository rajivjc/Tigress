// =============================================================================
// Social feed data accessors (Session 20)
// =============================================================================
// Dual-mode: backed by Supabase when configured, falls back to the in-memory
// MOCK_POSTS / MOCK_POST_LIKES arrays otherwise. The UI never sees the raw
// row shape — each call returns enriched `FeedPost` records with the author,
// like count, and "is-liked-by-me" flag already resolved.
//
// Cursor pagination uses `created_at` DESC. `listFeed` asks for `limit + 1`
// rows; if the extra row comes back, its timestamp becomes `nextCursor` so
// the client can fetch the next page.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_MEMBERS, MOCK_POSTS, MOCK_POST_LIKES } from "./mock-data";
import { MOCK_ACCOUNTS } from "@/lib/auth/mock-users";
import type { Member, Staff, StaffRole } from "@/lib/types";
import type {
  FeedPost,
  PostAuthor,
  PostLikeRow,
  PostMediaType,
  PostRow,
} from "@/lib/types/posts";

// ---------- Current-user descriptor ----------

/**
 * Identifies who's making the request — used to scope `likedByCurrentUser`.
 * `null` is valid for callers that don't need the liked-state (cron jobs,
 * service callers).
 */
export type CurrentUser =
  | { kind: "member"; memberId: string }
  | { kind: "staff"; staffId: string }
  | null;

// ---------- Helpers ----------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clampLimit(limit?: number): number {
  if (!limit || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

// =============================================================================
// Reads
// =============================================================================

export interface ListFeedOpts {
  /** ISO timestamp; returns posts with created_at < cursor. Newest first. */
  beforeCursor?: string;
  /** Page size. Defaults to 20, capped at 50. */
  limit?: number;
  /** The signed-in user, used to compute `likedByCurrentUser`. */
  currentUser: CurrentUser;
}

export interface ListFeedResult {
  posts: FeedPost[];
  nextCursor: string | null;
}

export async function listFeed(opts: ListFeedOpts): Promise<ListFeedResult> {
  const limit = clampLimit(opts.limit);

  if (!isSupabaseConfigured()) {
    return listFeedMock(opts, limit);
  }
  return listFeedReal(opts, limit);
}

function listFeedMock(opts: ListFeedOpts, limit: number): ListFeedResult {
  const sorted = MOCK_POSTS.filter((p) => p.deleted_at === null)
    .filter((p) =>
      opts.beforeCursor ? p.created_at < opts.beforeCursor : true
    )
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const page = sorted.slice(0, limit + 1);
  const hasMore = page.length > limit;
  const rows = hasMore ? page.slice(0, limit) : page;

  const posts = rows.map((row) =>
    enrichPostFromMock(row, MOCK_POST_LIKES, opts.currentUser)
  );

  return {
    posts,
    nextCursor: hasMore ? rows[rows.length - 1]!.created_at : null,
  };
}

async function listFeedReal(
  opts: ListFeedOpts,
  limit: number
): Promise<ListFeedResult> {
  const supabase = createClient();

  // Fetch posts + author joins + correlated like data in a single round trip.
  // Supabase's embedded-resource syntax (the `members:author_member_id(...)`
  // aliases) lets us avoid N+1 without hand-writing SQL.
  let query = supabase
    .from("posts")
    .select(
      `
      id,
      author_member_id,
      author_staff_id,
      system_generated,
      body,
      media_type,
      media_url,
      created_at,
      deleted_at,
      deleted_by_member_id,
      deleted_by_staff_id,
      author_member:members!author_member_id(id, full_name, avatar_url),
      author_staff:staff!author_staff_id(id, full_name, role),
      post_likes(liker_member_id, liker_staff_id)
    `
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (opts.beforeCursor) {
    query = query.lt("created_at", opts.beforeCursor);
  }

  const { data } = await query;
  // Supabase's embedded-resource types are over-eager and return arrays even
  // for !fk hints that resolve to at most one row — cast through unknown.
  const rows = ((data as unknown) as FeedRowFromDb[] | null) ?? [];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const posts = page.map((row) => enrichPostFromJoin(row, opts.currentUser));

  return {
    posts,
    nextCursor: hasMore ? page[page.length - 1]!.created_at : null,
  };
}

export async function getPost(
  id: string,
  currentUser: CurrentUser
): Promise<FeedPost | null> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_POSTS.find((p) => p.id === id && p.deleted_at === null);
    if (!row) return null;
    return enrichPostFromMock(row, MOCK_POST_LIKES, currentUser);
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("posts")
    .select(
      `
      id,
      author_member_id,
      author_staff_id,
      system_generated,
      body,
      media_type,
      media_url,
      created_at,
      deleted_at,
      deleted_by_member_id,
      deleted_by_staff_id,
      author_member:members!author_member_id(id, full_name, avatar_url),
      author_staff:staff!author_staff_id(id, full_name, role),
      post_likes(liker_member_id, liker_staff_id)
    `
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;
  return enrichPostFromJoin((data as unknown) as FeedRowFromDb, currentUser);
}

/** Returns the raw post row (including deleted ones) — used by the delete
 *  action to authorise the caller before calling softDeletePost. */
export async function getPostRaw(id: string): Promise<PostRow | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_POSTS.find((p) => p.id === id) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as PostRow | null) ?? null;
}

// =============================================================================
// Writes
// =============================================================================

export interface CreatePostInput {
  authorKind: "member" | "staff";
  authorId: string;
  body: string;
  mediaType: PostMediaType;
  mediaUrl: string | null;
}

export async function createPost(
  input: CreatePostInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    const id = randomId("post");
    MOCK_POSTS.push({
      id,
      author_member_id: input.authorKind === "member" ? input.authorId : null,
      author_staff_id: input.authorKind === "staff" ? input.authorId : null,
      system_generated: false,
      body: input.body,
      media_type: input.mediaType,
      media_url: input.mediaUrl,
      created_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by_member_id: null,
      deleted_by_staff_id: null,
    });
    return { success: true, id };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_member_id: input.authorKind === "member" ? input.authorId : null,
      author_staff_id: input.authorKind === "staff" ? input.authorId : null,
      system_generated: false,
      body: input.body,
      media_type: input.mediaType,
      media_url: input.mediaUrl,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, id: (data as { id: string }).id };
}

export interface SoftDeletePostInput {
  postId: string;
  actorKind: "member" | "staff";
  actorId: string;
}

/**
 * Soft-delete. In real mode we use the service-role admin client because RLS
 * blocks UPDATE on `posts` — authorisation is enforced in the server action
 * (manager/owner can delete any post; members/staff can only delete their own).
 */
export async function softDeletePost(
  input: SoftDeletePostInput
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_POSTS.find((p) => p.id === input.postId);
    if (!row) return { success: false, error: "Post not found" };
    if (row.deleted_at !== null) {
      return { success: false, error: "Post already deleted" };
    }
    row.deleted_at = new Date().toISOString();
    row.deleted_by_member_id =
      input.actorKind === "member" ? input.actorId : null;
    row.deleted_by_staff_id =
      input.actorKind === "staff" ? input.actorId : null;
    return { success: true };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("posts")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by_member_id:
        input.actorKind === "member" ? input.actorId : null,
      deleted_by_staff_id:
        input.actorKind === "staff" ? input.actorId : null,
    })
    .eq("id", input.postId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export interface ToggleLikeInput {
  postId: string;
  likerKind: "member" | "staff";
  likerId: string;
}

export interface ToggleLikeResult {
  success: boolean;
  liked: boolean;
  newCount: number;
  error?: string;
}

/**
 * Idempotent like toggle. Inspects current state and either INSERTs or
 * DELETEs the liker's row, then returns the new count.
 */
export async function toggleLike(
  input: ToggleLikeInput
): Promise<ToggleLikeResult> {
  if (!isSupabaseConfigured()) {
    const existingIdx = MOCK_POST_LIKES.findIndex(
      (l) =>
        l.post_id === input.postId &&
        (input.likerKind === "member"
          ? l.liker_member_id === input.likerId
          : l.liker_staff_id === input.likerId)
    );

    if (existingIdx >= 0) {
      MOCK_POST_LIKES.splice(existingIdx, 1);
    } else {
      MOCK_POST_LIKES.push({
        post_id: input.postId,
        liker_member_id:
          input.likerKind === "member" ? input.likerId : null,
        liker_staff_id:
          input.likerKind === "staff" ? input.likerId : null,
        created_at: new Date().toISOString(),
      });
    }

    const newCount = MOCK_POST_LIKES.filter(
      (l) => l.post_id === input.postId
    ).length;
    return {
      success: true,
      liked: existingIdx < 0,
      newCount,
    };
  }

  const supabase = createClient();
  const filterColumn =
    input.likerKind === "member" ? "liker_member_id" : "liker_staff_id";

  const { data: existing } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("post_id", input.postId)
    .eq(filterColumn, input.likerId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("post_likes")
      .delete()
      .eq("post_id", input.postId)
      .eq(filterColumn, input.likerId);
    if (error) {
      return { success: false, liked: true, newCount: 0, error: error.message };
    }
  } else {
    const { error } = await supabase.from("post_likes").insert({
      post_id: input.postId,
      liker_member_id:
        input.likerKind === "member" ? input.likerId : null,
      liker_staff_id: input.likerKind === "staff" ? input.likerId : null,
    });
    if (error) {
      return { success: false, liked: false, newCount: 0, error: error.message };
    }
  }

  const { count } = await supabase
    .from("post_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", input.postId);

  return {
    success: true,
    liked: !existing,
    newCount: count ?? 0,
  };
}

// =============================================================================
// Row → FeedPost enrichment
// =============================================================================

interface FeedRowFromDb extends PostRow {
  author_member: Pick<Member, "id" | "full_name" | "avatar_url"> | null;
  author_staff: Pick<Staff, "id" | "full_name" | "role"> | null;
  post_likes: Pick<PostLikeRow, "liker_member_id" | "liker_staff_id">[];
}

function enrichPostFromJoin(
  row: FeedRowFromDb,
  currentUser: CurrentUser
): FeedPost {
  let author: PostAuthor;
  if (row.system_generated) {
    author = { kind: "system" };
  } else if (row.author_member) {
    author = {
      kind: "member",
      id: row.author_member.id,
      displayName: row.author_member.full_name,
      avatarUrl: row.author_member.avatar_url,
    };
  } else if (row.author_staff) {
    author = {
      kind: "staff",
      id: row.author_staff.id,
      displayName: row.author_staff.full_name,
      role: row.author_staff.role,
    };
  } else {
    // Shouldn't happen because of the CHECK constraint, but stay defensive
    // so a bad row doesn't crash the whole feed render.
    author = { kind: "system" };
  }

  const likes = row.post_likes ?? [];
  const likedByCurrentUser = currentUser
    ? likes.some((l) =>
        currentUser.kind === "member"
          ? l.liker_member_id === currentUser.memberId
          : l.liker_staff_id === currentUser.staffId
      )
    : false;

  return {
    id: row.id,
    author,
    body: row.body,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    createdAt: row.created_at,
    likeCount: likes.length,
    likedByCurrentUser,
  };
}

function enrichPostFromMock(
  row: PostRow,
  allLikes: PostLikeRow[],
  currentUser: CurrentUser
): FeedPost {
  let author: PostAuthor;
  if (row.system_generated) {
    author = { kind: "system" };
  } else if (row.author_member_id) {
    const member = MOCK_MEMBERS.find((m) => m.id === row.author_member_id);
    author = {
      kind: "member",
      id: row.author_member_id,
      displayName: member?.full_name ?? "Member",
      avatarUrl: member?.avatar_url ?? null,
    };
  } else if (row.author_staff_id) {
    const account = MOCK_ACCOUNTS.find(
      (a) =>
        (a.profile as Staff).id === row.author_staff_id && a.role !== "member"
    );
    const staff = account?.profile as Staff | undefined;
    author = {
      kind: "staff",
      id: row.author_staff_id,
      displayName: staff?.full_name ?? "Staff",
      role: (staff?.role as StaffRole | undefined) ?? "staff",
    };
  } else {
    author = { kind: "system" };
  }

  const likes = allLikes.filter((l) => l.post_id === row.id);
  const likedByCurrentUser = currentUser
    ? likes.some((l) =>
        currentUser.kind === "member"
          ? l.liker_member_id === currentUser.memberId
          : l.liker_staff_id === currentUser.staffId
      )
    : false;

  return {
    id: row.id,
    author,
    body: row.body,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    createdAt: row.created_at,
    likeCount: likes.length,
    likedByCurrentUser,
  };
}
