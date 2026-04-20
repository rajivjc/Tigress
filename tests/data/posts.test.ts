import { describe, it, expect, beforeEach } from "vitest";
import {
  createPost,
  getPost,
  listFeed,
  softDeletePost,
  toggleLike,
} from "@/lib/data/posts";
import { MOCK_POSTS } from "@/lib/data/mock-data";
import { resetMockData } from "../helpers/reset-mock-data";

const MONA_ID = "mock-member-row-1";
const MANAGER_STAFF_ID = "mock-staff-row-2";

describe("post data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  // ===========================================================================
  // listFeed
  // ===========================================================================
  describe("listFeed", () => {
    it("returns posts newest first", async () => {
      const { posts } = await listFeed({
        currentUser: { kind: "member", memberId: MONA_ID },
      });
      for (let i = 1; i < posts.length; i++) {
        expect(posts[i - 1]!.createdAt >= posts[i]!.createdAt).toBe(true);
      }
      // Seeded data includes 8 posts (all within first page at limit 20).
      expect(posts.length).toBe(8);
    });

    it("paginates via beforeCursor", async () => {
      const firstPage = await listFeed({
        limit: 3,
        currentUser: { kind: "member", memberId: MONA_ID },
      });
      expect(firstPage.posts.length).toBe(3);
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await listFeed({
        limit: 3,
        beforeCursor: firstPage.nextCursor!,
        currentUser: { kind: "member", memberId: MONA_ID },
      });
      expect(secondPage.posts.length).toBe(3);
      // No overlap between page 1 and page 2.
      const firstIds = new Set(firstPage.posts.map((p) => p.id));
      for (const p of secondPage.posts) {
        expect(firstIds.has(p.id)).toBe(false);
      }
      // Second page posts are strictly older than the cursor.
      for (const p of secondPage.posts) {
        expect(p.createdAt < firstPage.nextCursor!).toBe(true);
      }
    });

    it("filters out soft-deleted posts", async () => {
      // Soft-delete the first seeded post.
      const victim = MOCK_POSTS[0]!;
      await softDeletePost({
        postId: victim.id,
        actorKind: "staff",
        actorId: MANAGER_STAFF_ID,
      });

      const { posts } = await listFeed({
        currentUser: { kind: "member", memberId: MONA_ID },
      });
      expect(posts.some((p) => p.id === victim.id)).toBe(false);
    });

    it("sets likedByCurrentUser correctly for the viewer", async () => {
      const { posts } = await listFeed({
        currentUser: { kind: "member", memberId: MONA_ID },
      });

      // Seed fixture: Mona likes post-seed-1 (among others) but NOT post-seed-3.
      const liked = posts.find((p) => p.id === "post-seed-1");
      const notLiked = posts.find((p) => p.id === "post-seed-3");
      expect(liked?.likedByCurrentUser).toBe(true);
      expect(notLiked?.likedByCurrentUser).toBe(false);

      // Another viewer (Alex — member-row-2) has a different liked-state.
      const { posts: alexPosts } = await listFeed({
        currentUser: { kind: "member", memberId: "mock-member-row-2" },
      });
      expect(
        alexPosts.find((p) => p.id === "post-seed-3")?.likedByCurrentUser
      ).toBe(true);
    });

    it("surfaces a system-generated post with author kind 'system'", async () => {
      MOCK_POSTS.unshift({
        id: "post-system-tournament-1",
        author_member_id: null,
        author_staff_id: null,
        system_generated: true,
        body: "Weekly tournament results are in!",
        media_type: "none",
        media_url: null,
        created_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by_member_id: null,
        deleted_by_staff_id: null,
      });

      const { posts } = await listFeed({
        currentUser: { kind: "member", memberId: MONA_ID },
      });
      const systemPost = posts.find((p) => p.id === "post-system-tournament-1");
      expect(systemPost).toBeTruthy();
      expect(systemPost!.author.kind).toBe("system");
    });
  });

  // ===========================================================================
  // getPost
  // ===========================================================================
  describe("getPost", () => {
    it("returns an enriched FeedPost for a known id", async () => {
      const post = await getPost("post-seed-1", {
        kind: "member",
        memberId: MONA_ID,
      });
      expect(post).not.toBeNull();
      expect(post!.author.kind).toBe("staff");
      expect(post!.likeCount).toBeGreaterThan(0);
    });

    it("returns null for an unknown id", async () => {
      const post = await getPost("does-not-exist", null);
      expect(post).toBeNull();
    });
  });

  // ===========================================================================
  // createPost / softDeletePost / toggleLike smoke tests
  // ===========================================================================
  describe("createPost", () => {
    it("stores a text-only member post", async () => {
      const before = MOCK_POSTS.length;
      const res = await createPost({
        authorKind: "member",
        authorId: MONA_ID,
        body: "Hello world",
        mediaType: "none",
        mediaUrl: null,
      });
      expect(res.success).toBe(true);
      expect(res.id).toBeTruthy();
      expect(MOCK_POSTS.length).toBe(before + 1);
      const stored = MOCK_POSTS.find((p) => p.id === res.id)!;
      expect(stored.body).toBe("Hello world");
      expect(stored.author_member_id).toBe(MONA_ID);
      expect(stored.author_staff_id).toBeNull();
    });
  });

  describe("toggleLike", () => {
    it("is idempotent: first call likes, second unlikes", async () => {
      const first = await toggleLike({
        postId: "post-seed-1",
        likerKind: "member",
        likerId: "mock-member-row-3", // Priya hasn't liked this post yet
      });
      expect(first.liked).toBe(true);
      expect(first.newCount).toBeGreaterThan(0);

      const second = await toggleLike({
        postId: "post-seed-1",
        likerKind: "member",
        likerId: "mock-member-row-3",
      });
      expect(second.liked).toBe(false);
      expect(second.newCount).toBe(first.newCount - 1);
    });
  });
});
