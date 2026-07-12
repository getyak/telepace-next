"use client";
import * as React from "react";
import { cn } from "../cn";
import { renderInlineMarkdown } from "./inlineMarkdown";

export type ChatRole = "respondent" | "interviewer" | "system";

/**
 * Split an interviewer line into an optional Latin-script "lead-in" (a courtesy
 * opener the backend prepends, e.g. "Thanks for taking the time — …") and the
 * real question in the interview's own language (here CJK). When the whole line
 * is one script, the lead is empty and the body is the whole thing. This turns
 * a jarring mixed-script run into an intentional "aside → question" typographic
 * layering, without touching the backend contract.
 */
function splitLeadIn(text: string): { lead: string; body: string } {
  const firstCjk = text.search(/[㐀-鿿　-〿＀-￯]/);
  // No CJK, or CJK starts at the very front → nothing to peel off.
  if (firstCjk <= 0) return { lead: "", body: text };
  const lead = text.slice(0, firstCjk).trim();
  const body = text.slice(firstCjk).trim();
  // Only treat the Latin head as a lead-in when it reads like a sentence (has a
  // space) — avoids splitting e.g. "ChatGPT的体验如何" mid-word.
  if (!lead || !/\s/.test(lead)) return { lead: "", body: text };
  return { lead, body };
}

/** A context-aware answer option the agent offers alongside a clarifying
 * question. Selecting one (or several, when multi) sends it as the reply —
 * the researcher steers the design without typing a sentence. */
export type ClarifyOption = {
  /** Stable id for selection tracking. */
  id: string;
  /** The chip label shown to the researcher. */
  label: string;
  /** Optional one-line gloss under the label, for options that need context. */
  hint?: string;
};

export type ClarifyPrompt = {
  /** Whether the researcher can pick several options before submitting. */
  multi?: boolean;
  options: ClarifyOption[];
  /** Submit-button label for multi-select (ignored for single-select, which
   * sends immediately on click). Localized call sites pass a translated string. */
  submitLabel?: string;
  /** Optional escape hatch label, e.g. "Something else…" — clicking it just
   * refocuses the composer so the researcher can type freely. */
  freeformLabel?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  timestamp?: string;
  /** True while the agent is still composing this message (renders typing dots until text arrives). */
  pending?: boolean;
  /** When present on an interviewer message, renders context-aware answer
   * chips below the bubble (the domain-aware clarification pattern). */
  clarify?: ClarifyPrompt;
};

export function TypingDots({ label = "Thinking" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1" role="status" aria-label={label}>
      <span className="tp-typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
      <span className="tp-typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
      <span className="tp-typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
    </span>
  );
}

/**
 * Context-aware answer chips — the domain-aware clarification pattern.
 *
 * When the agent asks a clarifying question ("What decision should this
 * research support?") it can offer tailored options as chips. Single-select
 * sends the chosen label immediately; multi-select accumulates picks and
 * submits them joined. A freeform escape hatch hands control back to the
 * composer so the researcher is never boxed in.
 */
export function ClarifyChips({
  prompt,
  onSelect,
  onFreeform,
  disabled,
  groupLabel,
  countLabel,
}: {
  prompt: ClarifyPrompt;
  /** Called with the resolved reply text (single label, or joined labels). The
   * second arg is the chosen option's id on single-select — lets callers detect
   * a specific option (e.g. a "skip" escape hatch) without matching on label
   * text. Undefined on multi-select submit (several ids collapse to one reply). */
  onSelect: (text: string, optionId?: string) => void;
  /** Called when the researcher opts to type instead. */
  onFreeform?: () => void;
  disabled?: boolean;
  /** Accessible name for the chip group (e.g. "Answer options"). Gives screen
   * readers the semantic boundary that these buttons form one answer set. */
  groupLabel?: string;
  /** Builds the submit button's accessible name from the pick count, e.g.
   * (n) => `Continue, ${n} selected`. Keeps the count out of the visible-label
   * concatenation ("Continue 3") that reads awkwardly to screen readers. */
  countLabel?: (n: number) => string;
}) {
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  // Guards against a double-fire in the single-select window before the parent
  // flips `disabled` (chips unmount a tick later).
  const [locked, setLocked] = React.useState(false);
  const multi = prompt.multi ?? false;

  function toggle(opt: ClarifyOption) {
    if (disabled || locked) return;
    if (!multi) {
      setLocked(true);
      onSelect(opt.label, opt.id);
      return;
    }
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(opt.id)) next.delete(opt.id);
      else next.add(opt.id);
      return next;
    });
  }

  function submit() {
    if (disabled || locked || picked.size === 0) return;
    const labels = prompt.options.filter((o) => picked.has(o.id)).map((o) => o.label);
    setLocked(true);
    onSelect(labels.join(", "));
  }

  return (
    <div className="mt-2.5 flex flex-col items-start gap-2.5">
      <div className="flex flex-wrap gap-2" role="group" aria-label={groupLabel}>
        {prompt.options.map((opt, i) => {
          const active = picked.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled || locked}
              onClick={() => toggle(opt)}
              aria-pressed={multi ? active : undefined}
              className={cn(
                "tp-chip-in group relative rounded-pill border px-3.5 py-1.5 text-left text-sm",
                "transition-[color,background-color,border-color,box-shadow,transform] duration-150",
                "disabled:cursor-not-allowed disabled:opacity-40",
                active
                  ? "border-accent bg-accent-soft text-ink"
                  : "border-hairline bg-paper text-body hover:-translate-y-px hover:border-ink hover:bg-paper-sunken hover:text-ink hover:shadow-hover",
              )}
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <span className="flex items-center gap-1.5">
                {multi && (
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-input border transition-colors",
                      active ? "border-accent bg-accent text-paper" : "border-hairline",
                    )}
                  >
                    {active && (
                      <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M3 8.5 6.5 12 13 4.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                )}
                {opt.label}
              </span>
              {opt.hint && (
                <span className={cn("mt-0.5 block text-xs", active ? "text-ink-soft" : "text-muted")}>
                  {opt.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        {multi && (
          <button
            type="button"
            disabled={disabled || locked || picked.size === 0}
            onClick={submit}
            aria-label={
              countLabel && picked.size > 0 ? countLabel(picked.size) : undefined
            }
            className={cn(
              "h-8 rounded-btn px-3.5 text-sm transition-colors",
              "bg-ink text-paper hover:bg-ink-soft disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            {prompt.submitLabel ?? "Continue"}
            {picked.size > 0 && (
              <span aria-hidden className="ml-1.5 font-mono text-xs opacity-70">
                {picked.size}
              </span>
            )}
          </button>
        )}
        {prompt.freeformLabel && onFreeform && (
          <button
            type="button"
            disabled={disabled}
            onClick={onFreeform}
            className="text-sm text-muted transition-colors hover:text-ink disabled:opacity-40"
          >
            {prompt.freeformLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 * ReadinessSpine — wizard-grade certainty inside a single conversation.
 *
 * Listen Labs gives creation certainty through a five-screen wizard. telepace
 * keeps its single conversational canvas (serif, warm paper, whitespace — the
 * aesthetic moat) and reassembles that certainty as a live five-pip spine in
 * the guide header: the researcher glances up and knows exactly what the agent
 * has captured and what's still open — without ever clicking "Next".
 *
 * Presentational only: it takes an already-derived readiness value (the pure
 * seam lives in the app's clarify.ts) plus injected localized labels, so this
 * package stays free of app-side domain logic and the component is trivially
 * themeable and testable. Every state is legible without colour or motion:
 * a hollow ring (pending), a filled dot with a ✓ and heavier label (satisfied),
 * or a dimmed em-dash (not-applicable) — WCAG 1.4.1.
 * -------------------------------------------------------------------------- */

/** A single pip's state. Mirrors the app's `PipState`; duplicated here so the
 * UI package carries no app dependency. */
export type PipStatus = "pending" | "satisfied" | "na";

/** One pip: a stable key, its localized label, and its current status. The
 * caller builds this array (in spine order) from its derived readiness. */
export type ReadinessPip = { key: string; label: string; status: PipStatus };

export function ReadinessSpine({
  pips,
  /** The pip key that JUST flipped to satisfied on the latest patch, if any —
   * pings once. Null on the steady state and always under reduced-motion. */
  justSatisfied,
  /** Accessible name for the whole spine, e.g. "Study readiness". */
  label,
}: {
  pips: ReadinessPip[];
  justSatisfied?: string | null;
  label?: string;
}) {
  return (
    <div className="flex items-center" role="group" aria-label={label}>
      {pips.map((pip, idx) => {
        const satisfied = pip.status === "satisfied";
        const na = pip.status === "na";
        // The connecting spine: the segment leading into this pip reads as
        // "traversed" (accent) once the previous checkpoint is satisfied, so the
        // row resolves into one progress backbone rather than five loose dots —
        // giving the create loop's soul-state the visual weight it was missing.
        const prevSatisfied = idx > 0 && pips[idx - 1].status === "satisfied";
        return (
          <React.Fragment key={pip.key}>
            {idx > 0 && (
              <span
                aria-hidden
                className={cn(
                  "h-px w-5 shrink-0 transition-colors duration-300",
                  prevSatisfied ? "bg-accent" : "bg-hairline",
                )}
              />
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap px-1 text-xs transition-colors",
                satisfied ? "font-medium text-ink" : "text-muted",
              )}
            >
              <span
                // The mark carries meaning three ways so it never relies on colour:
                // filled dot + ✓ (satisfied), hollow ring (pending), em-dash (n/a).
                aria-hidden
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] leading-none transition-colors",
                  satisfied && "bg-accent text-paper",
                  // A visible pending ring — the old hairline ring all but
                  // vanished; muted@50% reads as "waiting" without shouting.
                  !satisfied && !na && "border border-muted/50",
                  na && "border border-hairline",
                  // The one-shot ping is gated by the caller (null under
                  // reduced-motion) AND by the CSS reduced-motion query.
                  satisfied && pip.key === justSatisfied && "tp-ping-once",
                )}
              >
                {satisfied ? (
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8.5 6.5 12 13 4.5"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : na ? (
                  <span className="text-muted">—</span>
                ) : null}
              </span>
              {pip.label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** Localized accessible names for the clarify chips, threaded from the app. */
export type ClarifyLabels = {
  /** Accessible name for the chip group, e.g. "Answer options". */
  group?: string;
  /** Builds the submit button's accessible name, e.g. (n) => `Continue, ${n} selected`. */
  count?: (n: number) => string;
};

export function ChatBubble({
  message,
  typingLabel,
  onClarify,
  onClarifyFreeform,
  clarifyDisabled,
  clarifyLabels,
  bylineLabel,
  isPrimaryQuestion,
  isPast,
  questionNumber,
  questionTotal,
  receiptLabel,
}: {
  message: ChatMessage;
  /** Screen-reader label for the typing-indicator bubble. */
  typingLabel?: string;
  /** When the message carries a clarify prompt, this receives the resolved
   * reply text, the id of the prompt message that produced it, and — on
   * single-select — the chosen option's id (for detecting a specific option
   * such as a "skip" escape hatch). */
  onClarify?: (text: string, messageId: string, optionId?: string) => void;
  /** Called (with the prompt message id) when the researcher chooses to type
   * freely instead of picking a chip. */
  onClarifyFreeform?: (messageId: string) => void;
  /** Disables chip interaction (e.g. while a request is in flight). */
  clarifyDisabled?: boolean;
  /** Localized accessible names for the clarify chips. */
  clarifyLabels?: ClarifyLabels;
  /** Optional "researcher" byline shown above interviewer messages, e.g.
   * "研究者". Omit to hide the byline entirely. */
  bylineLabel?: string;
  /** The current, awaiting-an-answer interviewer question — rendered as the
   * page's protagonist: serif display, larger, a bold accent rail and a faint
   * accent wash. This is what gives the text mode Listen Labs' single-question
   * focus without abandoning the scrolling transcript. */
  isPrimaryQuestion?: boolean;
  /** An already-answered interviewer question earlier in the thread — dimmed so
   * the eye lands on the current one; restores on hover for re-reading. */
  isPast?: boolean;
  /** 1-based question number for the numbering marginalia on interviewer
   * questions (e.g. 3), bridging the top pip spine to the in-feed question. */
  questionNumber?: number | null;
  /** Total question count, for the "3 / 7" marginalia. */
  questionTotal?: number | null;
  /** When set on the latest respondent reply, shows a one-shot "captured" tick
   * + this label (e.g. "已记录") beneath it — the emotional receipt. */
  receiptLabel?: string;
}) {
  const isRespondent = message.role === "respondent";
  const isSystem = message.role === "system";
  const showTyping = message.pending && !message.text;
  const showClarify = message.clarify && !message.pending && onClarify;
  const isInterviewer = !isRespondent && !isSystem;
  // Peel a Latin courtesy opener off the front of an interviewer line so it can
  // be typeset as a quiet aside above the real (CJK) question.
  const { lead, body } =
    isInterviewer && !showTyping ? splitLeadIn(message.text) : { lead: "", body: message.text };
  // Detect a wholly-Latin question (the backend occasionally answers in English
  // mid-interview). Such a line has no CJK anchor, so the serif-display "hero"
  // treatment would splash a wall of Latin across warm paper. We tone it down to
  // read as a deliberate language shift, not a typographic accident.
  const cjkCount = (body.match(/[㐀-鿿　-〿＀-￯]/g) || []).length;
  const latinHeavy = body.length > 12 && cjkCount / body.length < 0.15;
  const enHero = isPrimaryQuestion && latinHeavy;

  return (
    <div
      className={cn(
        "tp-msg-in flex w-full flex-col",
        isRespondent ? "items-end" : "items-start",
        isSystem && "items-center",
      )}
    >
      {/* Interviewer signature — just the name, quiet muted, no accent dot.
          The lone accent dot is reserved for the masthead brand mark so sage
          stays scarce (quiet luxury); "wash + serif" is the sole focus signal,
          and the question number lives once, in the top progress bar. */}
      {isInterviewer && bylineLabel && (
        <span className="mb-2 block pl-1 text-[12px] font-medium uppercase tracking-[0.1em] text-muted">
          {bylineLabel}
        </span>
      )}
      <div
        className={cn(
          // No hardcoded line-height: each script inherits its body rule
          // (en 1.55, zh 1.7 from globals.css) — a cramped 1.5 override on zh
          // was the biggest a11y regression in the old bubble.
          "whitespace-pre-wrap transition-[opacity,background-color] duration-300",
          isRespondent
            // Researcher's reply — a quotation slipped onto the page, not an IM
            // balloon: elevated paper, a hairline, no drop shadow. The softened
            // bottom-right corner keeps the "sent from here" direction cue.
            ? "max-w-[82%] rounded-[18px] rounded-br-md border border-hairline bg-paper-elevated px-4 py-2.5 text-[15px] text-ink"
            : isSystem
              // System line — a small centered tracked whisper. text-body (AA)
              // not text-muted since a system sentence carries meaning.
              ? "px-2 py-1 text-center text-[11px] font-medium uppercase tracking-[0.12em] text-body"
              : isPrimaryQuestion
                // The live question — the protagonist. Serif display on a real,
                // visible sage wash sized to hug the sentence (max-w 52ch), not
                // a full-width banner, so it reads as "a beam of light on this
                // one line". A wholly-Latin line tones down one notch.
                ? cn(
                    // rounded-r-md (not xl) — a crisp cut paper edge, not a
                    // plastic bubble; a 2px rail reads as an editor's change-bar.
                    "w-fit max-w-[52ch] rounded-r-md border-l-2 border-accent bg-question-wash py-3.5 pl-5 pr-6 font-display leading-snug text-ink",
                    enHero ? "text-[19px] leading-relaxed" : "text-[clamp(1.375rem,2.4vw,1.75rem)]",
                  )
                : isPast
                  // Already answered — dimmed marginalia via a compliant muted
                  // tone (not body+opacity, which crushed contrast); hover lifts.
                  ? "max-w-[92%] border-l-2 border-hairline py-0.5 pl-4 pr-1 text-[15px] leading-relaxed text-muted transition-colors hover:text-ink"
                  // Any other interviewer line (rare) — quiet editorial default.
                  : "max-w-[92%] border-l-2 border-accent-soft py-0.5 pl-4 pr-1 text-[17px] leading-relaxed text-ink-soft",
        )}
      >
        {/* A wholly-Latin hero question gets a small "follow-up" overline so the
            language shift reads as intentional. */}
        {enHero && (
          <span className="mb-1.5 block font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            follow-up
          </span>
        )}
        {showTyping ? (
          <TypingDots label={typingLabel} />
        ) : lead ? (
          <>
            {/* Latin courtesy opener → a quiet aside above the real question. */}
            <span className="mb-1.5 block font-sans text-[13px] leading-relaxed text-faint">
              {renderInlineMarkdown(lead)}
            </span>
            {renderInlineMarkdown(body)}
          </>
        ) : (
          renderInlineMarkdown(body)
        )}
      </div>
      {/* Emotional receipt — the latest reply earns a one-shot "captured" tick,
          a quiet beat that says the answer landed and was kept. Decorative. */}
      {isRespondent && receiptLabel && (
        <span className="mt-1.5 flex items-center gap-1 pr-1 text-[11px] text-muted">
          <span
            aria-hidden
            className="tp-ping-once flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-paper"
          >
            <svg width="8" height="8" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8.5 6.5 12 13 4.5"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          {receiptLabel}
        </span>
      )}
      {showClarify && (
        <ClarifyChips
          prompt={message.clarify!}
          onSelect={(text, optionId) => onClarify!(text, message.id, optionId)}
          onFreeform={onClarifyFreeform ? () => onClarifyFreeform(message.id) : undefined}
          disabled={clarifyDisabled}
          groupLabel={clarifyLabels?.group}
          countLabel={clarifyLabels?.count}
        />
      )}
    </div>
  );
}

export function ChatFeed({
  messages,
  typingLabel,
  onClarify,
  onClarifyFreeform,
  clarifyDisabled,
  clarifyLabels,
  bylineLabel,
  progressCurrent,
  progressTotal,
  receiptLabel,
  promptHintLabel,
}: {
  messages: ChatMessage[];
  /** Screen-reader label for the typing-indicator bubble. Localized call
   * sites should pass a translated string via useTranslations(). */
  typingLabel?: string;
  /** Receives the resolved reply text and the prompt message id when a clarify
   * chip is selected. When omitted, clarify prompts render as plain bubbles. */
  onClarify?: (text: string, messageId: string) => void;
  /** Called (with the prompt message id) when the researcher opts to type. */
  onClarifyFreeform?: (messageId: string) => void;
  /** Disables chip interaction (e.g. while a request is in flight). */
  clarifyDisabled?: boolean;
  /** Localized accessible names for the clarify chips. */
  clarifyLabels?: ClarifyLabels;
  /** "Researcher" byline shown once atop each run of interviewer messages. */
  bylineLabel?: string;
  /** 1-based current question number. Kept for API compatibility; the number is
   * now shown only in the progress bar, not repeated in-feed. */
  progressCurrent?: number | null;
  /** Total question count. Kept for API compatibility (see above). */
  progressTotal?: number | null;
  /** "Captured" receipt label shown under the latest respondent reply. */
  receiptLabel?: string;
  /** A faint "type your answer below" nudge shown between the current question
   * and the composer, organizing the whitespace into a "question → answer"
   * beat rather than a flat void. */
  promptHintLabel?: string;
}) {
  const endRef = React.useRef<HTMLDivElement>(null);
  const primaryRef = React.useRef<HTMLDivElement>(null);
  const lastText = messages[messages.length - 1]?.text ?? "";

  // The last non-pending interviewer message is the "current question" — the
  // protagonist. Earlier interviewer questions are dimmed as answered history.
  let primaryIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "interviewer" && !messages[i].pending) {
      primaryIdx = i;
      break;
    }
  }
  // The latest respondent reply gets the "captured" receipt — but only if the
  // researcher hasn't already responded past it (once a new question lands the
  // receipt has served its purpose and would just clutter the history).
  let lastReplyIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "respondent") {
      lastReplyIdx = i;
      break;
    }
  }
  const showReceipt = lastReplyIdx >= 0 && lastReplyIdx >= primaryIdx;

  React.useEffect(() => {
    // Anchor the current question at the card's reading sweet-spot (vertical
    // center) on every turn — so question 1 through N all land in the same
    // stable spot, not drifting to the top as the thread grows. Falls back to
    // the end sentinel when there's no active question (e.g. only a reply).
    const target = primaryRef.current ?? endRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [messages.length, lastText, primaryIdx]);

  return (
    <div
      // A polite live region so streamed-in questions are announced to screen
      // readers as they arrive — core usability for a conversational product.
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      className="flex min-h-full flex-col justify-center gap-2 py-12"
    >
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        // Byline once per interviewer run (not repeated after the researcher
        // interjects mid-run).
        const firstOfRun = m.role === "interviewer" && prev?.role !== "interviewer";
        // Breathe between speakers: tight within one speaker's run, generous at
        // the hand-off, so each Q→A reads as one unit.
        const speakerSwitch = prev && prev.role !== m.role;
        const isPrimary = i === primaryIdx;
        return (
          <div
            key={m.id}
            ref={isPrimary ? primaryRef : undefined}
            // The current question gets a wider silence around it — a whitespace
            // funnel that pulls the eye to it (1.6–2x the ordinary gap).
            className={cn(
              isPrimary ? "my-6 sm:my-10" : speakerSwitch ? "mt-6" : "mt-1",
            )}
          >
            <ChatBubble
              message={m}
              typingLabel={typingLabel}
              onClarify={onClarify}
              onClarifyFreeform={onClarifyFreeform}
              clarifyDisabled={clarifyDisabled}
              clarifyLabels={clarifyLabels}
              bylineLabel={firstOfRun ? bylineLabel : undefined}
              isPrimaryQuestion={isPrimary}
              isPast={m.role === "interviewer" && !isPrimary && !m.pending}
              receiptLabel={showReceipt && i === lastReplyIdx ? receiptLabel : undefined}
            />
          </div>
        );
      })}
      {/* A faint nudge between the current question and the composer, turning
          the gap into a deliberate "question → (your turn) → answer" beat.
          Only when the newest thing on screen is the question awaiting a reply. */}
      {promptHintLabel && primaryIdx >= 0 && primaryIdx === messages.length - 1 && (
        <p className="mt-8 pl-1 text-xs text-faint">{promptHintLabel}</p>
      )}
      <div ref={endRef} />
    </div>
  );
}

export function ChatComposer({
  onSend,
  placeholder = "Type your reply…",
  sendLabel = "Send",
  disabled,
  focusSignal,
  hintLabel,
  textareaLabel,
  bare,
}: {
  onSend: (text: string) => void;
  placeholder?: string;
  /** Submit button text. Localized call sites should pass a translated
   * string via useTranslations(). */
  sendLabel?: string;
  disabled?: boolean;
  /** Change this number to programmatically focus the textarea — used by the
   * "type instead" escape hatch on clarify prompts. */
  focusSignal?: number;
  /** Optional micro-hint shown at the trailing edge on focus, e.g.
   * "Enter to send · Shift+Enter for a new line". Purely a nicety. */
  hintLabel?: string;
  /** Stable accessible name for the textarea, decoupled from the (changing)
   * placeholder — e.g. "Your reply". A screen reader must always know what the
   * field is for, even when the placeholder flips to a waiting state. */
  textareaLabel?: string;
  /** Drops the top border + translucent backdrop so the composer sits flush
   * inside a bounded stage card (which already provides the edge). */
  bare?: boolean;
}) {
  const [value, setValue] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const hintId = React.useId();
  React.useEffect(() => {
    if (focusSignal) taRef.current?.focus();
  }, [focusSignal]);
  // Grow the textarea with its content (up to a ceiling) so a long answer never
  // scrolls inside a one-line box — the composer feels like a real writing
  // surface, not a search field.
  const autosize = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);
  React.useEffect(autosize, [value, autosize]);

  const canSend = !disabled && value.trim().length > 0;

  return (
    <form
      className={cn(
        "px-4 pb-4 pt-3",
        bare ? "" : "border-t border-hairline bg-paper/80 backdrop-blur-sm",
      )}
      onSubmit={(e) => {
        e.preventDefault();
        const t = value.trim();
        if (!t) return;
        onSend(t);
        setValue("");
      }}
    >
      {/* One rounded well holds the field and the send affordance — a single
          tactile surface that lifts on focus, rather than a box + a button. */}
      <div
        className={cn(
          "flex items-end gap-2 rounded-[20px] border bg-paper-elevated px-3 py-2 transition-all duration-200",
          focused
            ? "border-ink/25 shadow-hover ring-4 ring-accent-soft/40"
            : "border-hairline hover:border-ink/20",
          disabled && "opacity-60",
        )}
      >
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          aria-label={textareaLabel ?? placeholder}
          aria-describedby={hintLabel ? hintId : undefined}
          className="max-h-40 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
            }
          }}
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={sendLabel}
          className={cn(
            "mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
            canSend
              ? "bg-accent text-paper hover:scale-105 active:scale-95"
              : "cursor-not-allowed bg-paper-sunken text-muted",
          )}
        >
          {/* An upward paper-plane / arrow — sending is lift-off, not a labelled
              button. Falls back to the label for screen readers via aria-label. */}
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 20V5M12 5l-6 6M12 5l6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {hintLabel && (
        <p
          id={hintId}
          className={cn(
            "mt-1.5 pl-2 text-[11px] text-muted transition-opacity duration-200",
            focused ? "opacity-100" : "opacity-0",
          )}
        >
          {hintLabel}
        </p>
      )}
    </form>
  );
}

/* -------------------------------------------------------------------------- *
 * TextStage — the full-viewport text interview stage.
 *
 * Listen Labs' text interview makes the whole viewport the stage: one huge
 * question centered in a sea of whitespace, a bare inline input, no card, no
 * chrome. This is that interaction rebuilt in telepace's editorial skin —
 * serif question on warm paper (not sans on white), a sage "current" tick (not
 * a wash banner), a ruled writing line (not a blue link), and a warm "captured"
 * receipt Listen Labs never offers. It surpasses the reference by keeping the
 * same focus while carrying temperature the cold-blue original lacks.
 *
 * Transport-free: the page feeds it the current question, the just-answered
 * line (for the fade-out beat), connection state and a send handler.
 * -------------------------------------------------------------------------- */
export function TextStage({
  /** The current interviewer question — the hero, serif and large. */
  question,
  /** The most recent respondent reply, shown small above the question as a
   * fading "you just said this" echo. Omit before the first answer. */
  lastReply,
  /** True while the interviewer is composing the next question (typing dots in
   * place of the hero, so the stage never goes blank). */
  pending,
  /** True once the socket is open; before that the hero shows a connecting beat. */
  connected,
  onSend,
  disabled,
  placeholder,
  sendLabel,
  hintLabel,
  textareaLabel,
  /** Byline above the question, e.g. "研究者". */
  bylineLabel,
  /** One-shot "captured" label under the last reply echo, e.g. "已记录". */
  receiptLabel,
  /** Connecting caption, e.g. "连接中…". */
  connectingLabel,
  /** Thinking caption for the pending beat, e.g. "正在输入". */
  typingLabel,
}: {
  question: string;
  lastReply?: string | null;
  pending?: boolean;
  connected?: boolean;
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  sendLabel?: string;
  hintLabel?: string;
  textareaLabel?: string;
  bylineLabel?: string;
  receiptLabel?: string;
  connectingLabel?: string;
  typingLabel?: string;
}) {
  const { lead, body } = pending ? { lead: "", body: "" } : splitLeadIn(question);
  const cjkCount = (body.match(/[㐀-鿿　-〿＀-￯]/g) || []).length;
  const latinHeavy = body.length > 12 && cjkCount / body.length < 0.15;

  return (
    <div className="flex h-full w-full flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-[46rem]">
        {/* The just-answered line — a quiet echo above the new question, with a
            one-shot "captured" tick. It reassures ("that landed") without
            competing with the hero. Re-keys per reply so it fades in fresh. */}
        {lastReply && (
          <div key={lastReply} className="tp-msg-in mb-8 flex flex-col items-start gap-1">
            <p className="max-w-[38ch] text-[15px] leading-relaxed text-faint">
              <span className="mr-1.5 select-none text-muted">“</span>
              {lastReply}
              <span className="ml-0.5 select-none text-muted">”</span>
            </p>
            {receiptLabel && (
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <span
                  aria-hidden
                  className="tp-ping-once flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-paper"
                >
                  <svg width="8" height="8" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8.5 6.5 12 13 4.5"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                {receiptLabel}
              </span>
            )}
          </div>
        )}

        {/* Byline — a thin "who's asking" label above the hero. */}
        {bylineLabel && (
          <span className="mb-4 flex items-center gap-2 pl-[1.125rem] text-[12px] font-medium uppercase tracking-[0.1em] text-muted">
            <span aria-hidden className="h-1 w-1 rounded-full bg-accent" />
            {bylineLabel}
          </span>
        )}

        {/* The hero question — the whole stage exists to read this. A single
            2px sage rule on the leading edge marks "this is the live question"
            with far less ink than a wash banner. Re-keyed so each question
            fades in cleanly. role=log/aria-live so it's announced. */}
        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          className="border-l-2 border-accent pl-4"
        >
          {pending ? (
            <span className="flex items-center gap-2 py-2 text-muted">
              <TypingDots label={typingLabel} />
            </span>
          ) : !connected ? (
            <span className="flex items-center gap-2.5 py-2 text-muted">
              <span
                aria-hidden
                className="tp-breathe h-2 w-2 rounded-full bg-accent"
              />
              {connectingLabel}
            </span>
          ) : (
            <p
              key={question}
              className={cn(
                "tp-fade-in-up font-display text-ink",
                latinHeavy
                  ? "text-[clamp(1.5rem,2.8vw,2rem)] leading-snug"
                  : "text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.15]",
              )}
            >
              {lead && (
                <span className="mb-3 block font-sans text-[13px] font-normal leading-relaxed tracking-normal text-muted">
                  {renderInlineMarkdown(lead)}
                </span>
              )}
              {renderInlineMarkdown(body)}
            </p>
          )}
        </div>

        {/* The writing line — a bare ruled input, not a boxed well. It reads as
            a line on a page: the rule warms to sage on focus, the send glyph is
            a naked accent arrow. Surpasses Listen Labs' blue-link input by
            feeling like handwriting rather than a form field. */}
        <StageComposer
          onSend={onSend}
          disabled={disabled}
          placeholder={placeholder}
          sendLabel={sendLabel}
          hintLabel={hintLabel}
          textareaLabel={textareaLabel}
        />
      </div>
    </div>
  );
}

/**
 * StageComposer — the bare "writing line" input for the full-viewport stage.
 *
 * No boxed well: a single ruled line under the text, warming to sage on focus,
 * with a naked accent send arrow. Autosizes upward for long answers. This is
 * the tactile heart of the stage — the respondent writes ON the page, not INTO
 * a widget.
 */
export function StageComposer({
  onSend,
  placeholder = "Type your reply…",
  sendLabel = "Send",
  disabled,
  hintLabel,
  textareaLabel,
}: {
  onSend: (text: string) => void;
  placeholder?: string;
  sendLabel?: string;
  disabled?: boolean;
  hintLabel?: string;
  textareaLabel?: string;
}) {
  const [value, setValue] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const hintId = React.useId();
  const autosize = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);
  React.useEffect(autosize, [value, autosize]);

  const canSend = !disabled && value.trim().length > 0;

  return (
    <form
      className="mt-10"
      onSubmit={(e) => {
        e.preventDefault();
        const t = value.trim();
        if (!t) return;
        onSend(t);
        setValue("");
      }}
    >
      <div
        className={cn(
          // A ruled line, not a box. The rule sits below the text and its
          // colour + thickness carry the focus state (WCAG: not colour alone —
          // it also thickens). Generous left inset aligns the text with the
          // question's rail so answer and question share a margin.
          "flex items-end gap-3 border-b pb-2.5 pl-4 transition-colors duration-200",
          focused ? "border-b-[1.5px] border-accent" : "border-hairline",
          disabled && "opacity-50",
        )}
      >
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          aria-label={textareaLabel ?? placeholder}
          aria-describedby={hintLabel ? hintId : undefined}
          className="max-h-52 flex-1 resize-none bg-transparent py-1 text-[17px] leading-relaxed text-ink placeholder:text-faint focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
            }
          }}
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={sendLabel}
          className={cn(
            "mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
            canSend
              ? "text-accent hover:scale-110 active:scale-95"
              : "cursor-not-allowed text-faint",
          )}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 20V5M12 5l-6 6M12 5l6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {hintLabel && (
        <p
          id={hintId}
          className={cn(
            "mt-2 pl-4 text-[11px] text-faint transition-opacity duration-200",
            focused ? "opacity-100" : "opacity-0",
          )}
        >
          {hintLabel}
        </p>
      )}
    </form>
  );
}

/**
 * VoiceOrb — the living centerpiece of a voice interview.
 *
 * A voice-native product should *look* alive where a text tool sits still.
 * At rest the orb breathes slowly (two offset halos); while the interviewer
 * speaks, a ring of accent waveform bars rises around a brighter core; while
 * the respondent records, the core turns to ink and pulses, and a mic glyph
 * shows through. Everything degrades to a calm static disc under
 * `prefers-reduced-motion`.
 *
 * Passing `onClick` promotes the orb to a real button — the single, obvious
 * "speak now" affordance a voice interview needs (the Listen Labs pattern),
 * rendered in telepace's warm palette instead of a cold blue mic circle.
 */
export function VoiceOrb({
  speaking = false,
  /** The respondent's mic is live and capturing. Renders an ink pulsing core
   * with a stop glyph — visually distinct from the accent "speaking" wave so a
   * glance tells you who holds the floor. */
  recording = false,
  /** Softer, smaller variant for inline placement (e.g. beside a transcript). */
  size = "lg",
  /** When provided, the orb becomes a <button> — the primary record control.
   * Omit for a purely decorative status orb (voice mode with auto-capture). */
  onClick,
  /** Disables the button (e.g. before the socket connects). */
  disabled = false,
  /** Localized status labels. Kept as props (with English defaults) so the
   * decorative orb is never a hardcoded-English island — a voice interview in
   * zh must announce "面试官正在讲话" to screen readers, not "speaking". */
  speakingLabel = "Interviewer is speaking",
  listeningLabel = "Listening",
  /** Announced (and used as the button's accessible name) while recording. */
  recordingLabel = "Recording — tap to send",
}: {
  speaking?: boolean;
  recording?: boolean;
  size?: "lg" | "md";
  onClick?: () => void;
  disabled?: boolean;
  speakingLabel?: string;
  listeningLabel?: string;
  recordingLabel?: string;
}) {
  const dim = size === "lg" ? "h-40 w-40" : "h-28 w-28";
  const core = size === "lg" ? "h-24 w-24" : "h-16 w-16";
  const glyph = size === "lg" ? 30 : 22;
  // A fixed ring of bars; only their scaleY animates, staggered around the
  // circle so the waveform appears to travel. The stagger span equals the
  // animation period (tp-wave-kf, 2.6s) so the ring's seam (last bar → first)
  // is phase-continuous — the travelling wave closes on itself, no visible
  // dead spot at 0°/360°.
  const bars = size === "lg" ? 28 : 20;
  const radius = size === "lg" ? 66 : 46;
  const WAVE_PERIOD = 2.6;
  const label = recording ? recordingLabel : speaking ? speakingLabel : listeningLabel;
  const interactive = typeof onClick === "function";

  const inner = (
    <>
      {/* Status is also spoken: role=img aria-label changes are not status
          messages, so a polite live region carries the speaking⇄listening
          switch to screen readers as it happens. */}
      <span className="sr-only" role="status" aria-live="polite">
        {label}
      </span>
      {/* Outer halo — always breathing, slower and fainter. Warms to ink-tint
          while recording so the whole orb reads as "you're live". */}
      <div
        className={cn(
          "absolute inset-0 rounded-full tp-breathe transition-colors duration-500",
          recording ? "bg-ink/10 opacity-70" : "bg-accent-soft opacity-40",
          speaking && !recording && "opacity-60",
        )}
      />
      {/* Inner halo — offset breath for depth; swells when speaking/recording. */}
      <div
        className={cn(
          "absolute rounded-full transition-all duration-700 ease-out",
          size === "lg" ? "inset-4" : "inset-3",
          recording ? "bg-ink/15" : "bg-accent-soft",
          speaking || recording ? "scale-110 opacity-80" : "scale-100 opacity-60",
        )}
      />
      {/* Waveform ring — rendered while the interviewer speaks OR the respondent
          records; ink bars for the respondent, accent for the interviewer. */}
      {(speaking || recording) && (
        <div className="absolute inset-0" aria-hidden>
          {Array.from({ length: bars }).map((_, i) => {
            const angle = (360 / bars) * i;
            return (
              <span
                key={i}
                className={cn(
                  "tp-wave-bar absolute left-1/2 top-1/2 block w-[2px] rounded-pill",
                  recording ? "bg-ink" : "bg-accent",
                )}
                style={{
                  height: size === "lg" ? 12 : 8,
                  transform: `rotate(${angle}deg) translateY(-${radius}px)`,
                  transformOrigin: "center top",
                  // Per-bar pulse delay. Span == period → phase-continuous seam
                  // (see note above). The one-shot rise ignores this (delay 0).
                  ["--wave-delay" as string]: `${(i / bars) * WAVE_PERIOD}s`,
                }}
              />
            );
          })}
        </div>
      )}
      {/* Core disc — accent at rest/speaking, ink while recording, with a mic
          glyph showing through on interactive orbs so the affordance is legible
          without motion or colour (WCAG 1.4.1). */}
      <div
        className={cn(
          "relative z-10 flex items-center justify-center rounded-full transition-all duration-500 ease-out",
          core,
          recording ? "bg-ink" : "bg-accent",
          speaking || recording ? "scale-105" : "scale-100",
          interactive &&
            !disabled &&
            !recording &&
            "group-hover:scale-105 group-active:scale-95",
        )}
      >
        {interactive && (
          <svg
            width={glyph}
            height={glyph}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            className="text-paper"
          >
            {recording ? (
              // A rounded square = "stop / send". Reads as the counterpart to
              // the mic without needing a label.
              <rect x="8" y="8" width="8" height="8" rx="2" fill="currentColor" />
            ) : (
              <>
                <rect
                  x="9"
                  y="3"
                  width="6"
                  height="11"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M6 11a6 6 0 0 0 12 0M12 17v3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </>
            )}
          </svg>
        )}
      </div>
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={recording}
        className={cn(
          "group relative flex items-center justify-center rounded-full",
          "transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-paper",
          "disabled:cursor-not-allowed disabled:opacity-40",
          dim,
        )}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={cn("relative flex items-center justify-center", dim)}
      role="img"
      aria-label={label}
    >
      {inner}
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 * VoiceControls — the quiet toolbar under a voice interview.
 *
 * Mirrors the two controls Listen Labs surfaces (read-aloud toggle + replay)
 * but as unobtrusive pill buttons in telepace's palette. Read-aloud is a real
 * switch (role state announced); replay is a momentary action, disabled while
 * the interviewer is already speaking so it can't stack playback.
 * -------------------------------------------------------------------------- */
export function VoiceControls({
  readAloud,
  onToggleReadAloud,
  readAloudLabel = "Read aloud",
  onReplay,
  replayLabel = "Replay question",
  replayDisabled,
  className,
}: {
  readAloud: boolean;
  onToggleReadAloud: () => void;
  readAloudLabel?: string;
  /** Omit to hide the replay button (e.g. before the first question lands). */
  onReplay?: () => void;
  replayLabel?: string;
  replayDisabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={readAloud}
        onClick={onToggleReadAloud}
        className={cn(
          "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-xs transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
          readAloud
            ? "border-accent bg-accent-soft text-ink"
            : "border-hairline bg-paper text-muted hover:border-ink hover:text-ink",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex h-3.5 w-3.5 items-center justify-center rounded-input border transition-colors",
            readAloud ? "border-accent bg-accent text-paper" : "border-hairline",
          )}
        >
          {readAloud && (
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8.5 6.5 12 13 4.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        {readAloudLabel}
      </button>
      {onReplay && (
        <button
          type="button"
          onClick={onReplay}
          disabled={replayDisabled}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-paper px-3 py-1.5 text-xs text-muted transition-colors",
            "hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
          )}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M13 8a5 5 0 1 1-1.46-3.54M13 2.5V5h-2.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {replayLabel}
        </button>
      )}
    </div>
  );
}

/** The respondent's live capture state, driving both the orb and its caption.
 * `idle` before the first tap, `recording` while the mic captures, `sending`
 * after a tap-to-send while transcription is in flight. */
export type VoicePhase = "idle" | "recording" | "sending";

/** Localized captions for each voice phase + the connecting state. Threaded in
 * so the stage carries no hardcoded English. */
export type VoiceStageLabels = {
  /** Under the orb before the first tap, e.g. "Tap to speak". */
  idle: string;
  /** While recording, e.g. "Listening — tap to send". */
  recording: string;
  /** After tap-to-send, e.g. "Sending…". */
  sending: string;
  /** While the interviewer speaks, e.g. "Interviewer is speaking". */
  speaking: string;
  /** Before the socket connects, e.g. "Connecting…". */
  connecting: string;
  /** Orb accessible names (passed through to VoiceOrb). */
  orbSpeaking: string;
  orbListening: string;
  orbRecording: string;
};

/**
 * VoiceStage — the single-question focus canvas for a voice interview.
 *
 * This is the Listen Labs interaction (one big question, a central record
 * affordance, a live caption, a quiet control row) rebuilt in telepace's
 * editorial skin: serif question on warm paper, an accent orb instead of a
 * blue mic, generous whitespace. It owns none of the transport — the page
 * feeds it the current question, connection/speaking flags and a phase, and
 * gets back taps on the orb.
 */
export function VoiceStage({
  question,
  phase,
  speaking,
  connected,
  onOrbTap,
  labels,
  readAloud,
  onToggleReadAloud,
  readAloudLabel,
  onReplay,
  replayLabel,
}: {
  /** The current interviewer question, shown large and centered. */
  question: string;
  phase: VoicePhase;
  /** The interviewer's TTS is playing — the orb shows the accent wave. */
  speaking: boolean;
  /** Socket is open; the orb is tappable only once connected. */
  connected: boolean;
  /** Called when the respondent taps the orb (start capture / send). */
  onOrbTap: () => void;
  labels: VoiceStageLabels;
  readAloud: boolean;
  onToggleReadAloud: () => void;
  readAloudLabel?: string;
  onReplay?: () => void;
  replayLabel?: string;
}) {
  const recording = phase === "recording";
  const caption = !connected
    ? labels.connecting
    : speaking
      ? labels.speaking
      : phase === "recording"
        ? labels.recording
        : phase === "sending"
          ? labels.sending
          : labels.idle;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-10">
      {/* The question — the whole stage is built around reading this one line.
          Re-key on the text so each new question fades in rather than swapping. */}
      <p
        key={question}
        className="tp-fade-in-up max-w-xl text-center font-display text-[clamp(1.5rem,4vw,2.25rem)] leading-snug text-ink"
      >
        {question}
      </p>

      <div className="flex flex-col items-center gap-4">
        <VoiceOrb
          speaking={speaking && !recording}
          recording={recording}
          onClick={onOrbTap}
          disabled={!connected || speaking || phase === "sending"}
          speakingLabel={labels.orbSpeaking}
          listeningLabel={labels.orbListening}
          recordingLabel={labels.orbRecording}
        />
        {/* Live caption — the one line that tells the respondent what to do
            next. aria-live so the guidance reaches screen readers on change. */}
        <p
          className={cn(
            "text-sm transition-colors",
            recording ? "font-medium text-ink" : "text-muted",
            phase === "sending" && "tp-pulse-slow",
          )}
          aria-live="polite"
        >
          {caption}
        </p>
      </div>

      <VoiceControls
        readAloud={readAloud}
        onToggleReadAloud={onToggleReadAloud}
        readAloudLabel={readAloudLabel}
        onReplay={onReplay}
        replayLabel={replayLabel}
        replayDisabled={speaking || !connected}
      />
    </div>
  );
}
