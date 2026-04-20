import { describe, it, expect, beforeEach } from "vitest";
import {
  createPostAction,
  deletePostAction,
  toggleLikeAction,
} from "@/app/actions/posts";
import { MOCK_POSTS } from "@/lib/data/mock-data";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../stubs/next-headers";
import { resetMockData } from "../helpers/reset-mock-data";

const VALID_YT_ID = "dQw4w9WgXcQ";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

describe("post server actions (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  // ===========================================================================
  // createPostAction
  // ===========================================================================
  describe("createPostAction", () => {
    it("creates a text-only post for a signed-in member", async () => {
      signInAs("mock-member-1");
      const before = MOCK_POSTS.length;
      const res = await createPostAction({ body: "Hello from Mona" });
      expect(res.success).toBe(true);
      expect(res.post).toBeTruthy();
      expect(res.post!.body).toBe("Hello from Mona");
      expect(res.post!.mediaType).toBe("none");
      expect(MOCK_POSTS.length).toBe(before + 1);
    });

    it("extracts a YouTube video ID from a watch URL", async () => {
      signInAs("mock-member-1");
      const res = await createPostAction({
        body: "Watch this",
        mediaUrl: `https://youtu.be/${VALID_YT_ID}?t=15`,
      });
      expect(res.success).toBe(true);
      expect(res.post!.mediaType).toBe("youtube");
      expect(res.post!.mediaUrl).toBe(VALID_YT_ID);
    });

    it("accepts a valid https image URL", async () => {
      signInAs("mock-member-1");
      const res = await createPostAction({
        body: "Match photo",
        mediaUrl: "https://example.com/photo.jpg",
      });
      expect(res.success).toBe(true);
      expect(res.post!.mediaType).toBe("image");
      expect(res.post!.mediaUrl).toBe("https://example.com/photo.jpg");
    });

    it("rejects an empty body", async () => {
      signInAs("mock-member-1");
      const res = await createPostAction({ body: "    " });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/empty/i);
    });

    it("rejects a body over 500 characters", async () => {
      signInAs("mock-member-1");
      const body = "a".repeat(501);
      const res = await createPostAction({ body });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/500/);
    });

    it("rejects a YouTube-shaped URL with a malformed id", async () => {
      signInAs("mock-member-1");
      const res = await createPostAction({
        body: "Broken link",
        mediaUrl: "https://www.youtube.com/watch?v=too-short",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/youtube/i);
    });

    it("rejects a non-image https URL that isn't a YouTube link", async () => {
      signInAs("mock-member-1");
      const res = await createPostAction({
        body: "Random link",
        mediaUrl: "https://example.com/article",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/image/i);
    });

    it("rejects when the caller isn't signed in", async () => {
      signInAs(null);
      const res = await createPostAction({ body: "Hello" });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/signed in/i);
    });
  });

  // ===========================================================================
  // deletePostAction
  // ===========================================================================
  describe("deletePostAction", () => {
    it("lets the author delete their own post", async () => {
      signInAs("mock-member-1");
      // post-seed-6 was authored by Mona (mock-member-row-1).
      const res = await deletePostAction("post-seed-6");
      expect(res.success).toBe(true);
      const row = MOCK_POSTS.find((p) => p.id === "post-seed-6")!;
      expect(row.deleted_at).not.toBeNull();
    });

    it("lets a manager delete any post", async () => {
      signInAs("mock-manager-1");
      // post-seed-2 was authored by Alex — the manager should still be able
      // to delete it.
      const res = await deletePostAction("post-seed-2");
      expect(res.success).toBe(true);
      const row = MOCK_POSTS.find((p) => p.id === "post-seed-2")!;
      expect(row.deleted_at).not.toBeNull();
    });

    it("blocks a non-author member from deleting someone else's post", async () => {
      signInAs("mock-member-1");
      // post-seed-2 is authored by Alex (not Mona).
      const res = await deletePostAction("post-seed-2");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/permission/i);
      const row = MOCK_POSTS.find((p) => p.id === "post-seed-2")!;
      expect(row.deleted_at).toBeNull();
    });
  });

  // ===========================================================================
  // toggleLikeAction
  // ===========================================================================
  describe("toggleLikeAction", () => {
    it("first call likes the post, second call unlikes it", async () => {
      signInAs("mock-member-1");
      // Mona hasn't liked post-seed-3 yet (seeded likers are Alex/Priya/Maya).
      const first = await toggleLikeAction("post-seed-3");
      expect(first.success).toBe(true);
      expect(first.liked).toBe(true);

      const second = await toggleLikeAction("post-seed-3");
      expect(second.success).toBe(true);
      expect(second.liked).toBe(false);
      expect(second.newCount).toBe(first.newCount - 1);
    });
  });
});
