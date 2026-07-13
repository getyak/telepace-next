"use client";

import * as React from "react";
import { TypingDots, cn, renderInlineMarkdown } from "@telepace/ui";

import type { ChatMessage } from "@telepace/ui";

/**
 * The agent chat's own message renderer — deliberately NOT the interview
 * ChatBubble/ChatFeed. Those give the last interviewer line a serif "hero"
 * treatment (big display type, sage wash, accent rail) because in an interview
 * the current question IS the protagonist. A conversational copilot reply is
 * the opposite: it should read as quiet, comfortable assistant prose in a
 * narrow rail — small sans body, relaxed leading, tight spacing.
 *
 * apple-design: type is sized for the panel (14px body, not 20px+ display),
 * hierarchy comes from weight + spacing not size (§15); the surface stays
 * simple with the common path shown plainly (§6). Lightweight markdown — bold,
 * code, and `- ` / `1.` bullet lists — is parsed into real elements so the raw
 * markers never leak and a list reads as a list, not a wrapped run of text.
 */

type Block =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Group a reply's lines into paragraphs and lists. A run of `- ` lines becomes
 * one <ul>, a run of `1.` lines one <ol>; blank lines separate paragraphs.
 * Kept intentionally small — this is chat prose, not a document engine.
 */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: "p", text: para.join(" ") });
      para = [];
    }
  };

  for (const line of lines) {
    const bullet = line.match(BULLET_RE);
    const ordered = line.match(ORDERED_RE);
    if (bullet) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "ul") last.items.push(bullet[1]);
      else blocks.push({ kind: "ul", items: [bullet[1]] });
    } else if (ordered) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "ol") last.items.push(ordered[1]);
      else blocks.push({ kind: "ol", items: [ordered[1]] });
    } else if (line.trim() === "") {
      flushPara();
    } else {
      para.push(line.trim());
    }
  }
  flushPara();
  return blocks;
}

function AssistantProse({ text }: { text: string }) {
  const blocks = React.useMemo(() => toBlocks(text), [text]);
  return (
    <div className="flex flex-col gap-2 text-[14px] leading-relaxed text-body">
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>{renderInlineMarkdown(b.text)}</p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="flex flex-col gap-1">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2">
                <span aria-hidden className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-muted" />
                <span className="min-w-0">{renderInlineMarkdown(it)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="flex flex-col gap-1">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2">
                <span aria-hidden className="shrink-0 font-mono text-xs text-muted">
                  {j + 1}.
                </span>
                <span className="min-w-0">{renderInlineMarkdown(it)}</span>
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}

/**
 * One chat turn in the copilot rail. Respondent (the researcher) sits right in
 * a small quiet bubble; the agent's reply sits left as plain prose. Pending
 * agent turns show typing dots.
 */
export function AgentMessage({
  message,
  typingLabel,
}: {
  message: ChatMessage;
  typingLabel?: string;
}) {
  const isUser = message.role === "respondent";
  const showTyping = message.pending && !message.text;

  if (isUser) {
    return (
      <div className="tp-msg-in flex justify-end">
        <div className="max-w-[85%] rounded-bubble rounded-br-btn bg-paper-sunken px-3.5 py-2 text-[14px] leading-relaxed text-ink">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("tp-msg-in flex flex-col", showTyping && "py-1")}>
      {showTyping ? (
        <TypingDots label={typingLabel} />
      ) : (
        <AssistantProse text={message.text} />
      )}
    </div>
  );
}
