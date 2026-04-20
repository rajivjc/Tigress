"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

/**
 * Plain <img> (not next/image) so we don't have to configure a domain
 * allow-list for arbitrary user-supplied image URLs. Falls back to a minimal
 * "image unavailable" panel if the request errors.
 */
export function PostImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface-2 px-3 py-4 text-xs text-white/50">
        <ImageOff size={14} strokeWidth={1.5} />
        Image unavailable
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="max-h-96 w-full rounded-xl border border-white/10 bg-surface-2 object-contain"
    />
  );
}
