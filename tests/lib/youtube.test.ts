import { describe, it, expect } from "vitest";
import { extractYouTubeVideoId, youTubeEmbedUrl } from "@/lib/youtube";

const VALID_ID = "dQw4w9WgXcQ";

describe("extractYouTubeVideoId", () => {
  it("extracts from www.youtube.com/watch?v=ID", () => {
    expect(extractYouTubeVideoId(`https://www.youtube.com/watch?v=${VALID_ID}`)).toBe(
      VALID_ID
    );
  });

  it("extracts from youtube.com/watch?v=ID with extra query params", () => {
    expect(
      extractYouTubeVideoId(
        `https://youtube.com/watch?v=${VALID_ID}&t=15s&feature=share`
      )
    ).toBe(VALID_ID);
  });

  it("extracts from youtu.be/ID", () => {
    expect(extractYouTubeVideoId(`https://youtu.be/${VALID_ID}`)).toBe(VALID_ID);
  });

  it("extracts from youtu.be/ID?t=15", () => {
    expect(extractYouTubeVideoId(`https://youtu.be/${VALID_ID}?t=15`)).toBe(
      VALID_ID
    );
  });

  it("extracts from youtube.com/embed/ID", () => {
    expect(
      extractYouTubeVideoId(`https://www.youtube.com/embed/${VALID_ID}`)
    ).toBe(VALID_ID);
  });

  it("extracts from youtube.com/shorts/ID", () => {
    expect(
      extractYouTubeVideoId(`https://www.youtube.com/shorts/${VALID_ID}`)
    ).toBe(VALID_ID);
  });

  it("extracts from m.youtube.com/watch?v=ID", () => {
    expect(
      extractYouTubeVideoId(`https://m.youtube.com/watch?v=${VALID_ID}`)
    ).toBe(VALID_ID);
  });

  it("returns null for malformed / non-URL strings", () => {
    expect(extractYouTubeVideoId("not a url at all")).toBeNull();
    expect(extractYouTubeVideoId("http://")).toBeNull();
    expect(extractYouTubeVideoId("youtube.com/watch?v=abc")).toBeNull();
  });

  it("returns null for non-YouTube URLs", () => {
    expect(
      extractYouTubeVideoId("https://vimeo.com/123456789")
    ).toBeNull();
    expect(
      extractYouTubeVideoId(`https://example.com/watch?v=${VALID_ID}`)
    ).toBeNull();
  });

  it("returns null for empty / whitespace input", () => {
    expect(extractYouTubeVideoId("")).toBeNull();
    expect(extractYouTubeVideoId("   ")).toBeNull();
  });

  it("returns null for a bare ID-like string (no domain)", () => {
    expect(extractYouTubeVideoId(VALID_ID)).toBeNull();
  });

  it("returns null when the v= param is malformed", () => {
    // 10-char id (too short)
    expect(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=abc123def4")
    ).toBeNull();
    // 12-char id (too long)
    expect(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=abc123def456")
    ).toBeNull();
  });
});

describe("youTubeEmbedUrl", () => {
  it("uses the privacy-enhanced host", () => {
    expect(youTubeEmbedUrl(VALID_ID)).toBe(
      `https://www.youtube-nocookie.com/embed/${VALID_ID}`
    );
  });
});
