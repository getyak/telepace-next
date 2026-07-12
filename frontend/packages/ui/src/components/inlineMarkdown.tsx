import * as React from "react";

/**
 * Minimal, safe inline-markdown renderer for chat bubbles.
 *
 * Agents occasionally emit lightweight markdown — `**bold**` and `` `code` `` —
 * into their replies. Rendering the bubble text raw leaks the literal markers
 * ("**Methodology Insight**") and looks broken. A full markdown engine is
 * overkill and a needless XSS surface for a chat line, so this handles exactly
 * two inline spans and nothing else.
 *
 * We deliberately DON'T render single-`*` italic: in a research chat a lone
 * asterisk is far more often a multiplication sign or a literal emphasis mark
 * ("5 * 3 * 2") than markdown italic, so italicizing it would corrupt real
 * content. Bold (`**`) and code (`` ` ``) have distinctive delimiters that
 * almost never appear by accident.
 *
 * Safety: it never touches innerHTML. It tokenizes the string and returns an
 * array of React nodes (plain strings + <strong>/<code>), so user/agent text
 * can only ever become text content — there is no HTML-injection path.
 * Unbalanced or unknown markers are left as literal characters (fail-safe: show
 * the raw text rather than swallow content).
 */

// One combined matcher. The groups are disjoint so there's no ambiguity:
// - **bold**  (non-greedy inner, requires non-space at the inner edges)
// - `code`
const INLINE_RE = /\*\*(\S(?:.*?\S)?)\*\*|`([^`]+)`/g;

/**
 * Parse a string into React nodes, rendering **bold** and `code`.
 * Returns a stable array (keyed) suitable for placing directly in JSX.
 */
export function renderInlineMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // Reset lastIndex defensively (module-level regex with the g flag is stateful).
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    // Guard against zero-width matches looping forever.
    if (m.index === INLINE_RE.lastIndex) {
      INLINE_RE.lastIndex += 1;
      continue;
    }
    if (m.index > lastIndex) {
      nodes.push(text.slice(lastIndex, m.index));
    }
    const [, bold, code] = m;
    if (bold !== undefined) {
      // Medium (not semibold) weight: the zh display/body faces synthesize an
      // ugly faux-bold at heavier weights, and medium already reads as emphasis
      // against the surrounding text in both scripts.
      nodes.push(
        <strong key={key++} className="font-medium">
          {bold}
        </strong>,
      );
    } else if (code !== undefined) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-paper-sunken px-1 py-0.5 font-mono text-[0.85em]"
        >
          {code}
        </code>,
      );
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}
