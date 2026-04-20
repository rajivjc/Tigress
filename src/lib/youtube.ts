// =============================================================================
// YouTube URL parsing
// =============================================================================
// Pure helper — extracts the 11-character video ID from any of the URL
// variants YouTube hands out. Used by the feed composer to normalise
// user-pasted URLs into the compact ID we store in `posts.media_url` and
// replay as `https://www.youtube-nocookie.com/embed/<id>` in PostCard.
//
// Video IDs are exactly 11 chars from the base64url-ish alphabet
// [A-Za-z0-9_-]. Anything else returns null and the server action rejects
// the post with a human-readable error.
// =============================================================================

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const ACCEPTED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

/**
 * Returns the 11-char YouTube video ID from any supported URL form, or null
 * if the URL isn't a YouTube URL we understand.
 *
 * Supported:
 *   - https://www.youtube.com/watch?v=ID
 *   - https://youtu.be/ID
 *   - https://www.youtube.com/embed/ID
 *   - https://www.youtube.com/shorts/ID
 *   - https://m.youtube.com/watch?v=ID
 *   - With or without `www.` / `http(s)`, with arbitrary extra query params.
 */
export function extractYouTubeVideoId(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!ACCEPTED_HOSTS.has(url.hostname.toLowerCase())) return null;

  // youtu.be/<id>
  if (url.hostname.toLowerCase() === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return VIDEO_ID_PATTERN.test(id) ? id : null;
  }

  // youtube.com/watch?v=<id>
  const vParam = url.searchParams.get("v");
  if (vParam && VIDEO_ID_PATTERN.test(vParam)) return vParam;

  // youtube.com/embed/<id>, /shorts/<id>, /v/<id>
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length >= 2) {
    const [prefix, id] = segments;
    if (
      (prefix === "embed" || prefix === "shorts" || prefix === "v") &&
      VIDEO_ID_PATTERN.test(id!)
    ) {
      return id!;
    }
  }

  return null;
}

/**
 * Build the embed URL we render in an iframe. Centralised so the choice of
 * privacy-enhanced host is enforced in one place.
 */
export function youTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}
