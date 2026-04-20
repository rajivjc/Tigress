// =============================================================================
// URL linkification
// =============================================================================
// Plain-text linkifier used by PostCard. We intentionally DON'T parse
// markdown — posts are plain text plus bare URLs. Any http(s) URL becomes an
// anchor that opens in a new tab with the usual noopener/noreferrer guard.
// =============================================================================

import { Fragment, type ReactNode } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<>()]+[^\s<>().,!?;:])/g;

export function linkify(text: string): ReactNode {
  if (!text) return null;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    const { index } = match;
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }
    const url = match[0];
    parts.push(
      <a
        key={`${index}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent break-words"
      >
        {url}
      </a>
    );
    lastIndex = index + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // Wrap in a Fragment so the return is always a single ReactNode.
  return <Fragment>{parts}</Fragment>;
}
