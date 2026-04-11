import { describe, it, expect, beforeEach } from "vitest";
import {
  DISMISS_STORAGE_KEY,
  DISMISS_WINDOW_MS,
  clearExpiredDismiss,
  detectPlatform,
  isDismissed,
  isStandalone,
  setDismissed,
  type DismissStorage,
} from "@/lib/pwa/install-banner";

// --- Fake storage ----------------------------------------------------------
function makeStorage(initial: Record<string, string> = {}): DismissStorage & {
  __map: Map<string, string>;
} {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    __map: map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

// Synthetic user-agent strings (trimmed to what our detector cares about).
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
  ipadSafari:
    "Mozilla/5.0 (iPad; CPU OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
  ipodSafari:
    "Mozilla/5.0 (iPod touch; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 Version/17.3 Mobile Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 CriOS/124.0.0.0 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 FxiOS/124.0 Mobile/15E148 Safari/604.1",
  iphoneEdge:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 EdgiOS/124.0 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  desktopFirefox:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0",
  desktopSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
};

describe("detectPlatform", () => {
  it("returns 'ios' for iPhone Safari", () => {
    expect(detectPlatform(UA.iphoneSafari)).toBe("ios");
  });

  it("returns 'ios' for iPad Safari", () => {
    expect(detectPlatform(UA.ipadSafari)).toBe("ios");
  });

  it("returns 'ios' for iPod Safari", () => {
    expect(detectPlatform(UA.ipodSafari)).toBe("ios");
  });

  it("does NOT return 'ios' for Chrome on iOS (CriOS has no native install)", () => {
    expect(detectPlatform(UA.iphoneChrome)).toBe("unsupported");
  });

  it("does NOT return 'ios' for Firefox on iOS", () => {
    expect(detectPlatform(UA.iphoneFirefox)).toBe("unsupported");
  });

  it("does NOT return 'ios' for Edge on iOS", () => {
    expect(detectPlatform(UA.iphoneEdge)).toBe("unsupported");
  });

  it("returns 'unsupported' for Android Chrome (upgraded later via beforeinstallprompt)", () => {
    expect(detectPlatform(UA.androidChrome)).toBe("unsupported");
  });

  it("returns 'unsupported' for desktop Chrome", () => {
    expect(detectPlatform(UA.desktopChrome)).toBe("unsupported");
  });

  it("returns 'unsupported' for desktop Firefox", () => {
    expect(detectPlatform(UA.desktopFirefox)).toBe("unsupported");
  });

  it("returns 'unsupported' for desktop Safari (no install flow)", () => {
    expect(detectPlatform(UA.desktopSafari)).toBe("unsupported");
  });

  it("handles an empty user agent without throwing", () => {
    expect(detectPlatform("")).toBe("unsupported");
  });
});

describe("isStandalone", () => {
  it("is true when display-mode matches standalone", () => {
    expect(
      isStandalone({
        matchMedia: (q) => ({ matches: q === "(display-mode: standalone)" }),
      }),
    ).toBe(true);
  });

  it("is false when display-mode does not match", () => {
    expect(
      isStandalone({
        matchMedia: () => ({ matches: false }),
      }),
    ).toBe(false);
  });

  it("is true when legacy iOS navigator.standalone is true", () => {
    expect(
      isStandalone({
        matchMedia: () => ({ matches: false }),
        navigatorStandalone: true,
      }),
    ).toBe(true);
  });

  it("is false when matchMedia is missing and navigator.standalone is false", () => {
    expect(isStandalone({ navigatorStandalone: false })).toBe(false);
  });

  it("is false when no signals are provided", () => {
    expect(isStandalone({})).toBe(false);
  });
});

describe("dismiss state (14-day window)", () => {
  const NOW = 1_800_000_000_000; // 2027-01-15 ish, an arbitrary stable anchor
  let storage: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    storage = makeStorage();
  });

  it("reports not dismissed when storage is empty", () => {
    expect(isDismissed(storage, NOW)).toBe(false);
  });

  it("persists the exact timestamp passed to setDismissed", () => {
    setDismissed(storage, NOW);
    expect(storage.__map.get(DISMISS_STORAGE_KEY)).toBe(String(NOW));
  });

  it("is dismissed immediately after setDismissed", () => {
    setDismissed(storage, NOW);
    expect(isDismissed(storage, NOW)).toBe(true);
  });

  it("remains dismissed just under 14 days later", () => {
    setDismissed(storage, NOW);
    expect(isDismissed(storage, NOW + DISMISS_WINDOW_MS - 1)).toBe(true);
  });

  it("expires exactly at the 14-day boundary", () => {
    setDismissed(storage, NOW);
    expect(isDismissed(storage, NOW + DISMISS_WINDOW_MS)).toBe(false);
  });

  it("expires beyond 14 days", () => {
    setDismissed(storage, NOW);
    const fifteenDays = 15 * 24 * 60 * 60 * 1000;
    expect(isDismissed(storage, NOW + fifteenDays)).toBe(false);
  });

  it("treats non-numeric stored values as not dismissed", () => {
    storage.setItem(DISMISS_STORAGE_KEY, "not-a-number");
    expect(isDismissed(storage, NOW)).toBe(false);
  });

  it("clearExpiredDismiss removes stale entries", () => {
    setDismissed(storage, NOW);
    clearExpiredDismiss(storage, NOW + DISMISS_WINDOW_MS + 1);
    expect(storage.__map.has(DISMISS_STORAGE_KEY)).toBe(false);
  });

  it("clearExpiredDismiss leaves fresh entries intact", () => {
    setDismissed(storage, NOW);
    clearExpiredDismiss(storage, NOW + 1000);
    expect(storage.__map.get(DISMISS_STORAGE_KEY)).toBe(String(NOW));
  });

  it("clearExpiredDismiss removes malformed entries", () => {
    storage.setItem(DISMISS_STORAGE_KEY, "garbage");
    clearExpiredDismiss(storage, NOW);
    expect(storage.__map.has(DISMISS_STORAGE_KEY)).toBe(false);
  });
});
