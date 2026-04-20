// =============================================================================
// Social feed types (Session 20)
// =============================================================================
// Mirrors the Supabase schema from migration 010_social_feed.sql.
// =============================================================================

import type { StaffRole } from "@/lib/types";

export type PostMediaType = "none" | "youtube" | "image";

/**
 * Raw posts row — matches the column shape the Supabase client returns.
 * `FeedPost` (below) is the enriched shape consumed by the UI.
 */
export interface PostRow {
  id: string;
  author_member_id: string | null;
  author_staff_id: string | null;
  system_generated: boolean;
  body: string;
  media_type: PostMediaType;
  media_url: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by_member_id: string | null;
  deleted_by_staff_id: string | null;
}

export interface PostLikeRow {
  post_id: string;
  liker_member_id: string | null;
  liker_staff_id: string | null;
  created_at: string;
}

export type PostAuthor =
  | {
      kind: "member";
      id: string;
      displayName: string;
      avatarUrl: string | null;
    }
  | {
      kind: "staff";
      id: string;
      displayName: string;
      role: StaffRole;
    }
  | { kind: "system" };

export interface FeedPost {
  id: string;
  author: PostAuthor;
  body: string;
  mediaType: PostMediaType;
  mediaUrl: string | null;
  createdAt: string;
  likeCount: number;
  likedByCurrentUser: boolean;
}
