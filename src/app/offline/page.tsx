import type { Metadata } from "next";
import { OfflineRetryButton } from "@/components/pwa/OfflineRetryButton";

// Mirrors the styling of `public/offline.html` which is what the service
// worker actually serves when the user is offline. This Next.js route exists
// so the URL `/offline` resolves with the same content when online.

export const metadata: Metadata = {
  title: "Offline — Tigress",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-surface-3 bg-surface-1 p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-2xl font-bold text-amber-500">
          T
        </div>
        <h1 className="mb-2 text-xl font-bold tracking-tight text-white">
          You&rsquo;re offline
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-white/70">
          Tigress needs an internet connection to show live table availability.
        </p>
        <OfflineRetryButton />
      </div>
    </main>
  );
}
