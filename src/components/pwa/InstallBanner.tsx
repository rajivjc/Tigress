"use client";

import { useEffect, useState } from "react";
import {
  clearExpiredDismiss,
  detectPlatform,
  isDismissed,
  isStandalone,
  setDismissed,
  type InstallPlatform,
} from "@/lib/pwa/install-banner";

/**
 * Chrome/Edge/Samsung Internet fire this event when the PWA meets install
 * criteria. TS doesn't ship a type, so declare the shape we actually use.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallBanner() {
  const [platform, setPlatform] = useState<InstallPlatform>("unsupported");
  const [showBanner, setShowBanner] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed? Never show the banner.
    if (
      isStandalone({
        matchMedia: window.matchMedia.bind(window),
        navigatorStandalone: (
          window.navigator as Navigator & { standalone?: boolean }
        ).standalone,
      })
    ) {
      return;
    }

    // Respect a recent dismiss, and clean up expired entries.
    clearExpiredDismiss(window.localStorage, Date.now());
    if (isDismissed(window.localStorage, Date.now())) return;

    // iOS Safari: show manual instructions immediately.
    const detected = detectPlatform(window.navigator.userAgent);
    if (detected === "ios") {
      setPlatform("ios");
      setShowBanner(true);
      return;
    }

    // Chromium-family: wait for the browser to tell us it's installable.
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setPlatform("chromium");
      setShowBanner(true);
    };

    // Hide the banner instantly if installation succeeds mid-session.
    const onAppInstalled = () => {
      setShowBanner(false);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setShowBanner(false);
      }
    } catch {
      // prompt() can throw if already used — just hide the banner.
      setShowBanner(false);
    } finally {
      setInstallPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(window.localStorage, Date.now());
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Tigress"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+88px)] sm:pb-[calc(env(safe-area-inset-bottom)+16px)]"
    >
      <div className="pointer-events-auto animate-fade-in w-full max-w-[480px] rounded-2xl border border-surface-3 bg-surface-2 p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-lg font-bold text-amber-500"
          >
            T
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Install Tigress</p>
            {platform === "chromium" ? (
              <p className="mt-0.5 text-xs leading-snug text-white/70">
                Quick access from your home screen.
              </p>
            ) : (
              <p className="mt-0.5 text-xs leading-snug text-white/70">
                Tap{" "}
                <span
                  aria-hidden="true"
                  className="mx-0.5 inline-flex h-4 w-4 -translate-y-px items-center justify-center rounded-sm border border-white/60 align-middle text-[10px] font-bold text-white/80"
                >
                  &#x2B06;
                </span>{" "}
                <span className="font-medium text-white/90">Share</span>, then{" "}
                <span className="font-medium text-white/90">
                  Add to Home Screen
                </span>
                .
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss install banner"
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-white/60 hover:bg-white/5 hover:text-white"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
              className="h-5 w-5"
            >
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {platform === "chromium" && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:translate-y-px"
            >
              Install
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
