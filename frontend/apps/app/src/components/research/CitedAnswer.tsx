"use client";

import * as React from "react";
import type { Citation } from "@/types/evidence";

/**
 * Renders answer text with inline citation markers like [1], [2].
 * Markers are matched against the ordered `citations` list and rendered as
 * clickable buttons (visual only for now — clicking logs to the console).
 */
export function CitedAnswer({
  text,
  citations,
  onCitationClick,
}: {
  text: string;
  citations: Citation[];
  onCitationClick?: (citation: Citation, index: number) => void;
}) {
  // Split on [n] markers, keeping the markers as separate tokens.
  const tokens = text.split(/(\[\d+\])/g);

  return (
    <span className="whitespace-pre-wrap">
      {tokens.map((token, i) => {
        const match = /^\[(\d+)\]$/.exec(token);
        if (!match) return <React.Fragment key={i}>{token}</React.Fragment>;

        const oneBased = Number(match[1]);
        const citation = citations[oneBased - 1];

        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (citation) {
                // Visual-only for now; surfaces the citation to the caller.
                console.log("citation clicked", oneBased, citation);
                onCitationClick?.(citation, oneBased - 1);
              }
            }}
            className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-accent-soft px-1 align-super text-[10px] font-medium text-accent hover:bg-accent hover:text-paper focus:outline-none focus:ring-1 focus:ring-accent"
            aria-label={`Citation ${oneBased}`}
          >
            {oneBased}
          </button>
        );
      })}
    </span>
  );
}
