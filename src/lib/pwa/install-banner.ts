/**
 * Pure logic for the PWA install banner. Kept framework-free so it can be
 * unit tested without a browser environment.
 *
 * The React component in `src/components/pwa/InstallBanner.tsx` composes
 * these helpers with event listeners and `useState`.
 */

export type InstallPlatform = "chromium" | "ios" | "unsupported";

/** localStorage key that stores the dismissal timestamp (epoch ms as string). */
export const DISMISS_STORAGE_KEY = "pwa-install-dismissed";

/** How long a dismiss suppresses the banner: 14 days in milliseconds. */
export const DISMISS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Minimal storage contract so tests can pass a fake without jsdom.
 * `window.localStorage` satisfies this shape structurally.
 */
export interface DismissStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Detect the install flow the current browser supports based purely on its
 * user-agent string.
 *
 * Notes:
 *   - iOS Safari never fires `beforeinstallprompt`; we always show manual
 *     "Add to Home Screen" instructions there.
 *   - Chromium-family browsers are reported as `"unsupported"` here — they
 *     upgrade to `"chromium"` only once the real `beforeinstallprompt` event
 *     fires, because not every Chromium build (or embedded webview) will
 *     actually offer installation.
 */
export function detectPlatform(userAgent: string): InstallPlatform {
  const ua = userAgent || "";

  const isIOSDevice = /iPad|iPhone|iPod/.test(ua);
  // Chrome on iOS is "CriOS", Firefox on iOS is "FxiOS", Edge is "EdgiOS".
  // Only real Safari supports "Add to Home Screen".
  const isIOSSafari = isIOSDevice && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

  if (isIOSSafari) return "ios";
  return "unsupported";
}

/**
 * True when the app is running in standalone display mode (i.e. launched
 * from the home screen). We should never show the banner in that case.
 *
 * Uses `matchMedia('(display-mode: standalone)')` plus the legacy iOS
 * `navigator.standalone` boolean which pre-dates display-mode.
 */
export function isStandalone(params: {
  matchMedia?: (query: string) => { matches: boolean };
  navigatorStandalone?: boolean;
}): boolean {
  const mm = params.matchMedia;
  if (mm && mm("(display-mode: standalone)").matches) return true;
  if (params.navigatorStandalone === true) return true;
  return false;
}

/**
 * Returns true if the user has dismissed the banner within the last 14 days.
 * Malformed or expired entries are treated as not-dismissed (and cleaned up
 * lazily by `clearExpiredDismiss`).
 */
export function isDismissed(storage: DismissStorage, now: number): boolean {
  const raw = storage.getItem(DISMISS_STORAGE_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return now - ts < DISMISS_WINDOW_MS;
}

/** Record a dismissal with the given timestamp. */
export function setDismissed(storage: DismissStorage, now: number): void {
  storage.setItem(DISMISS_STORAGE_KEY, String(now));
}

/** Removes an expired dismiss entry so it doesn't linger forever. */
export function clearExpiredDismiss(
  storage: DismissStorage,
  now: number,
): void {
  const raw = storage.getItem(DISMISS_STORAGE_KEY);
  if (!raw) return;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || now - ts >= DISMISS_WINDOW_MS) {
    storage.removeItem(DISMISS_STORAGE_KEY);
  }
}
