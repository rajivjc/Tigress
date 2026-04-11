/* Tigress service worker — hand-written, minimal.
 *
 * Strategy:
 *   - Navigation requests: network-first, fall back to cached /offline.html.
 *   - Static icon / manifest requests: cache-first.
 *   - Everything else (API calls, Next.js bundles, Supabase Realtime, etc.):
 *     passthrough. We intentionally do NOT cache Next's hashed JS bundles —
 *     they change every deploy and caching them causes stale-JS errors. We
 *     also do not intercept WebSockets (fetch handlers don't fire for them).
 *
 * Bump the cache version whenever the offline shell or the precache list
 * changes so clients drop stale entries on activation.
 */

const CACHE_VERSION = "tigress-v1";

const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // `reload` cache mode forces a bypass of the HTTP cache so we always
      // precache the freshest offline shell on install.
      cache.addAll(
        PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })),
      ),
    ),
  );
  // Become active immediately after install finishes.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/offline.html"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle GET. Leave POST/PUT/etc. untouched.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Don't touch cross-origin requests — let the network handle Supabase,
  // Stripe, analytics, fonts hosted elsewhere, etc.
  if (url.origin !== self.location.origin) return;

  // Navigation (HTML) requests: network-first, offline shell on failure.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline.html", { cacheName: CACHE_VERSION }),
      ),
    );
    return;
  }

  // Static icon / manifest / offline shell: cache-first.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request, { cacheName: CACHE_VERSION }).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            // Opportunistically cache successful same-origin static responses.
            if (response && response.ok) {
              const clone = response.clone();
              caches
                .open(CACHE_VERSION)
                .then((cache) => cache.put(request, clone));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else (Next.js bundles, API routes, server actions, etc.):
  // pass through to the network untouched.
});
