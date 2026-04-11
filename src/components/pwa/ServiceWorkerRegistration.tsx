"use client";

import { useEffect } from "react";

/**
 * Registers the Tigress service worker (`/sw.js`) on mount.
 *
 * Renders nothing. Intentionally uses a plain fetch-handler SW — we do not
 * want to pull in `next-pwa` or any library abstraction.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Swallow errors: a failing SW must not break the app.
      // eslint-disable-next-line no-console
      console.error("Service worker registration failed:", err);
    });
  }, []);

  return null;
}
