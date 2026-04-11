"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribePush, unsubscribePush } from "@/app/actions/push";

// ---------------------------------------------------------------------------
// State machine for the notification toggle UI.
// ---------------------------------------------------------------------------
type PushState =
  | "loading"
  | "unsupported" // Browser doesn't support Push API at all.
  | "needs-install" // iOS Safari, not yet added to home screen.
  | "needs-ios-upgrade" // iOS standalone but <16.4 / no PushManager.
  | "blocked" // Permission.denied — user has to fix it in browser settings.
  | "disabled" // Supported, not subscribed yet.
  | "enabling"
  | "enabled"
  | "disabling"
  | "error";

// ---------------------------------------------------------------------------
// VAPID key conversion — the browser wants a Uint8Array, Vercel gives us a
// base64url-encoded string. Standard transform straight from the MDN docs.
// ---------------------------------------------------------------------------
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function extractKeys(subscription: PushSubscription): {
  p256dh: string;
  auth: string;
} {
  return {
    p256dh: arrayBufferToBase64(subscription.getKey("p256dh")),
    auth: arrayBufferToBase64(subscription.getKey("auth")),
  };
}

interface PlatformShape {
  isIOS: boolean;
  isStandalone: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  hasServiceWorker: boolean;
}

function detectPlatform(): PlatformShape {
  if (typeof window === "undefined") {
    return {
      isIOS: false,
      isStandalone: false,
      hasPushManager: false,
      hasNotification: false,
      hasServiceWorker: false,
    };
  }
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;
  return {
    isIOS,
    isStandalone,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    hasServiceWorker: "serviceWorker" in navigator,
  };
}

export function PushSubscriptionControl() {
  const [state, setState] = useState<PushState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Initial sync — what does the browser think about push for this user?
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const p = detectPlatform();

      if (!p.hasServiceWorker) {
        if (!cancelled) setState("unsupported");
        return;
      }

      // iOS has strict rules: Push only works in a home-screen-installed app
      // running iOS 16.4+. Check these in order so we can show precise help.
      if (p.isIOS) {
        if (!p.isStandalone) {
          if (!cancelled) setState("needs-install");
          return;
        }
        if (!p.hasPushManager) {
          if (!cancelled) setState("needs-ios-upgrade");
          return;
        }
      } else if (!p.hasPushManager || !p.hasNotification) {
        if (!cancelled) setState("unsupported");
        return;
      }

      // Permission may already be 'denied' — surface that distinctly so we
      // can point the user at browser settings instead of re-prompting.
      if (Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) {
          setState(existing ? "enabled" : "disabled");
        }
      } catch (err) {
        console.warn("[push] init failed:", err);
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error ? err.message : "Failed to check subscription"
          );
          setState("error");
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------------------------
  // Enable: request permission → subscribe → persist on the server.
  // ------------------------------------------------------------------
  const handleEnable = useCallback(async () => {
    setErrorMessage(null);
    setState("enabling");

    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublic) {
      setErrorMessage(
        "Push is not configured on this server. Check VAPID keys."
      );
      setState("error");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("blocked");
        return;
      }
      if (permission !== "granted") {
        setState("disabled");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      // Cast to BufferSource — the DOM type expects an ArrayBuffer-backed
      // view and TS's default Uint8Array can be backed by SharedArrayBuffer
      // in theory, which makes it unassignable without a cast.
      const applicationServerKey = urlBase64ToUint8Array(
        vapidPublic
      ) as unknown as BufferSource;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const { p256dh, auth } = extractKeys(subscription);
      const result = await subscribePush({
        endpoint: subscription.endpoint,
        p256dh,
        auth,
        userAgent: window.navigator.userAgent,
      });

      if (!result.success) {
        // Roll back the browser-side subscription so we stay in sync.
        try {
          await subscription.unsubscribe();
        } catch {
          /* swallow */
        }
        setErrorMessage(result.error ?? "Failed to save subscription");
        setState("error");
        return;
      }

      setState("enabled");
    } catch (err) {
      console.warn("[push] enable failed:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to enable notifications"
      );
      setState("error");
    }
  }, []);

  // ------------------------------------------------------------------
  // Disable: unsubscribe in the browser and delete from the database.
  // ------------------------------------------------------------------
  const handleDisable = useCallback(async () => {
    setErrorMessage(null);
    setState("disabling");
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        const endpoint = existing.endpoint;
        await existing.unsubscribe();
        await unsubscribePush(endpoint);
      }
      setState("disabled");
    } catch (err) {
      console.warn("[push] disable failed:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to disable notifications"
      );
      setState("error");
    }
  }, []);

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">Push notifications</p>
          <p className="mt-0.5 text-xs leading-snug text-white/60">
            Get alerts for booking confirmations, cancellations, and session
            invites.
          </p>
        </div>
        {renderToggle(state, handleEnable, handleDisable)}
      </div>
      {renderStatusMessage(state, errorMessage)}
    </div>
  );
}

function renderToggle(
  state: PushState,
  onEnable: () => void,
  onDisable: () => void
) {
  const busy = state === "loading" || state === "enabling" || state === "disabling";

  if (
    state === "unsupported" ||
    state === "needs-install" ||
    state === "needs-ios-upgrade" ||
    state === "blocked"
  ) {
    return null;
  }

  if (state === "enabled") {
    return (
      <button
        type="button"
        onClick={onDisable}
        disabled={busy}
        className="shrink-0 rounded-lg border border-white/15 bg-surface-1/80 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/5 disabled:opacity-50"
      >
        {state === "enabled" ? "Disable" : "…"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onEnable}
      disabled={busy}
      className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
    >
      {state === "enabling" ? "Enabling…" : "Enable"}
    </button>
  );
}

function renderStatusMessage(state: PushState, errorMessage: string | null) {
  if (state === "loading") {
    return <p className="text-xs text-white/40">Checking permission…</p>;
  }
  if (state === "unsupported") {
    return (
      <p className="text-xs text-white/60">
        This browser doesn&apos;t support push notifications.
      </p>
    );
  }
  if (state === "needs-install") {
    return (
      <p className="text-xs text-white/60">
        Install Tigress to your home screen to enable notifications.
      </p>
    );
  }
  if (state === "needs-ios-upgrade") {
    return (
      <p className="text-xs text-white/60">
        Notifications require iOS 16.4 or newer.
      </p>
    );
  }
  if (state === "blocked") {
    return (
      <p className="text-xs text-white/60">
        Notifications are blocked. Enable them in your browser settings.
      </p>
    );
  }
  if (state === "enabled") {
    return <p className="text-xs text-emerald-400">Notifications enabled.</p>;
  }
  if (state === "error" && errorMessage) {
    return <p className="text-xs text-rose-400">{errorMessage}</p>;
  }
  return null;
}
