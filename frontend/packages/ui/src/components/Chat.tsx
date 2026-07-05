"use client";
import * as React from "react";
import { cn } from "../cn";

export type ChatRole = "respondent" | "interviewer" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  timestamp?: string;
  /** True while the agent is still composing this message (renders typing dots until text arrives). */
  pending?: boolean;
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

export function ChatBubble({
  message,
  typingLabel,
}: {
  message: ChatMessage;
  /** Screen-reader label for the typing-indicator bubble. */
  typingLabel?: string;
}) {
  const isRespondent = message.role === "respondent";
  const isSystem = message.role === "system";
  const showTyping = message.pending && !message.text;
  return (
    <div
      className={cn(
        "flex w-full",
        isRespondent ? "justify-end" : "justify-start",
        isSystem && "justify-center",
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
    </div>
  );
}

export function ChatFeed({
  messages,
  typingLabel,
}: {
  messages: ChatMessage[];
  /** Screen-reader label for the typing-indicator bubble. Localized call
   * sites should pass a translated string via useTranslations(). */
  typingLabel?: string;
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
        <ChatBubble key={m.id} message={m} typingLabel={typingLabel} />
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
}: {
  onSend: (text: string) => void;
  placeholder?: string;
  /** Submit button text. Localized call sites should pass a translated
   * string via useTranslations(). */
  sendLabel?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = React.useState("");
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

export function VoiceOrb({ speaking = false }: { speaking?: boolean }) {
  return (
    <div className="relative flex items-center justify-center w-40 h-40">
      <div
        className={cn(
          "absolute inset-0 rounded-full bg-accent-soft transition-transform",
          speaking ? "scale-110 animate-pulse" : "scale-100",
        )}
      />
      <div className="relative z-10 w-24 h-24 rounded-full bg-accent" />
    </div>
  );
}
