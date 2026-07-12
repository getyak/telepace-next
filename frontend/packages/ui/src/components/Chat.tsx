"use client";
import * as React from "react";
import { cn } from "../cn";

export type ChatRole = "respondent" | "interviewer" | "system";

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
  /** Called with the resolved reply text (single label, or joined labels). */
  onSelect: (text: string) => void;
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
      onSelect(opt.label);
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
}: {
  message: ChatMessage;
  /** Screen-reader label for the typing-indicator bubble. */
  typingLabel?: string;
  /** When the message carries a clarify prompt, this receives the resolved
   * reply text and the id of the prompt message that produced it. */
  onClarify?: (text: string, messageId: string) => void;
  /** Called (with the prompt message id) when the researcher chooses to type
   * freely instead of picking a chip. */
  onClarifyFreeform?: (messageId: string) => void;
  /** Disables chip interaction (e.g. while a request is in flight). */
  clarifyDisabled?: boolean;
  /** Localized accessible names for the clarify chips. */
  clarifyLabels?: ClarifyLabels;
}) {
  const isRespondent = message.role === "respondent";
  const isSystem = message.role === "system";
  const showTyping = message.pending && !message.text;
  const showClarify = message.clarify && !message.pending && onClarify;
  return (
    <div
      className={cn(
        "flex w-full flex-col",
        isRespondent ? "items-end" : "items-start",
        isSystem && "items-center",
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-card px-4 py-3 text-[15px] leading-[1.5] whitespace-pre-wrap",
          isRespondent
            ? "bg-ink text-paper"
            : isSystem
              ? "bg-paper-sunken text-muted text-sm"
              : "bg-paper-elevated border border-hairline text-ink",
        )}
      >
        {showTyping ? <TypingDots label={typingLabel} /> : message.text}
      </div>
      {showClarify && (
        <ClarifyChips
          prompt={message.clarify!}
          onSelect={(text) => onClarify!(text, message.id)}
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
}) {
  const endRef = React.useRef<HTMLDivElement>(null);
  const lastText = messages[messages.length - 1]?.text ?? "";
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    // Track streaming text growth too, not just new messages.
  }, [messages.length, lastText]);
  return (
    <div className="flex flex-col gap-3 py-4">
      {messages.map((m) => (
        <ChatBubble
          key={m.id}
          message={m}
          typingLabel={typingLabel}
          onClarify={onClarify}
          onClarifyFreeform={onClarifyFreeform}
          clarifyDisabled={clarifyDisabled}
          clarifyLabels={clarifyLabels}
        />
      ))}
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
}) {
  const [value, setValue] = React.useState("");
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (focusSignal) taRef.current?.focus();
  }, [focusSignal]);
  return (
    <form
      className="flex items-end gap-2 border-t border-hairline bg-paper p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const t = value.trim();
        if (!t) return;
        onSend(t);
        setValue("");
      }}
    >
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none bg-transparent border border-hairline rounded-btn px-3 py-2 text-[15px] focus:outline-none focus:border-ink"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
          }
        }}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="h-10 px-4 rounded-btn bg-ink text-paper disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {sendLabel}
      </button>
    </form>
  );
}

/**
 * VoiceOrb — the living centerpiece of a voice interview.
 *
 * A voice-native product should *look* alive where a text tool sits still.
 * At rest the orb breathes slowly (two offset halos); while the interviewer
 * speaks, a ring of waveform bars rises around a brighter core. Everything
 * degrades to a calm static disc under `prefers-reduced-motion`.
 */
export function VoiceOrb({
  speaking = false,
  /** Softer, smaller variant for inline placement (e.g. beside a transcript). */
  size = "lg",
  /** Localized status labels. Kept as props (with English defaults) so the
   * decorative orb is never a hardcoded-English island — a voice interview in
   * zh must announce "面试官正在讲话" to screen readers, not "speaking". */
  speakingLabel = "Interviewer is speaking",
  listeningLabel = "Listening",
}: {
  speaking?: boolean;
  size?: "lg" | "md";
  speakingLabel?: string;
  listeningLabel?: string;
}) {
  const dim = size === "lg" ? "h-40 w-40" : "h-28 w-28";
  const core = size === "lg" ? "h-24 w-24" : "h-16 w-16";
  // A fixed ring of bars; only their scaleY animates, staggered around the
  // circle so the waveform appears to travel. The stagger span equals the
  // animation period (tp-wave-kf, 2.6s) so the ring's seam (last bar → first)
  // is phase-continuous — the travelling wave closes on itself, no visible
  // dead spot at 0°/360°.
  const bars = size === "lg" ? 28 : 20;
  const radius = size === "lg" ? 66 : 46;
  const WAVE_PERIOD = 2.6;
  const label = speaking ? speakingLabel : listeningLabel;
  return (
    <div
      className={cn("relative flex items-center justify-center", dim)}
      role="img"
      aria-label={label}
    >
      {/* Status is also spoken: role=img aria-label changes are not status
          messages, so a polite live region carries the speaking⇄listening
          switch to screen readers as it happens. */}
      <span className="sr-only" role="status" aria-live="polite">
        {label}
      </span>
      {/* Outer halo — always breathing, slower and fainter. */}
      <div
        className={cn(
          "absolute inset-0 rounded-full bg-accent-soft opacity-40 tp-breathe",
          speaking && "opacity-60",
        )}
      />
      {/* Inner halo — offset breath for depth; swells when speaking. */}
      <div
        className={cn(
          "absolute rounded-full bg-accent-soft transition-transform duration-700 ease-out",
          size === "lg" ? "inset-4" : "inset-3",
          speaking ? "scale-110 opacity-80" : "scale-100 opacity-60",
        )}
      />
      {/* Waveform ring — only rendered while speaking. */}
      {speaking && (
        <div className="absolute inset-0" aria-hidden>
          {Array.from({ length: bars }).map((_, i) => {
            const angle = (360 / bars) * i;
            return (
              <span
                key={i}
                className="tp-wave-bar absolute left-1/2 top-1/2 block w-[2px] rounded-pill bg-accent"
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
      {/* Core disc. */}
      <div
        className={cn(
          "relative z-10 rounded-full bg-accent transition-transform duration-500 ease-out",
          core,
          speaking ? "scale-105" : "scale-100",
        )}
      />
    </div>
  );
}
