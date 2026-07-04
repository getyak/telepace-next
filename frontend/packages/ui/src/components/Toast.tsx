"use client";

/**
 * Minimal, dependency-free toast system.
 *
 *   <Toaster />            // mount once in the root layout
 *   toast.error({ title, description, action? })
 *   toast.success(...)     // .warning, .info
 */

import * as React from "react";
import { cn } from "../cn";

type Kind = "success" | "error" | "warning" | "info";

export type ToastItem = {
  id: number;
  kind: Kind;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  durationMs: number;
};

type ToastInput = Omit<ToastItem, "id" | "kind" | "durationMs"> & {
  durationMs?: number;
};

type Sub = (t: ToastItem) => void;
const subs = new Set<Sub>();
let idSeq = 1;

function push(kind: Kind, input: ToastInput): number {
  const t: ToastItem = {
    id: idSeq++,
    kind,
    durationMs: input.durationMs ?? (kind === "error" ? 6000 : 4000),
    title: input.title,
    description: input.description,
    action: input.action,
  };
  for (const s of subs) s(t);
  return t.id;
}

export const toast = {
  success: (input: ToastInput) => push("success", input),
  error: (input: ToastInput) => push("error", input),
  warning: (input: ToastInput) => push("warning", input),
  info: (input: ToastInput) => push("info", input),
};

const palette: Record<Kind, string> = {
  success: "border-success/25 bg-paper-elevated text-ink",
  error: "border-danger/25 bg-paper-elevated text-ink",
  warning: "border-warning/25 bg-paper-elevated text-ink",
  info: "border-hairline bg-paper-elevated text-ink",
};

const dot: Record<Kind, string> = {
  success: "bg-success",
  error: "bg-danger",
  warning: "bg-warning",
  info: "bg-accent",
};

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  React.useEffect(() => {
    const sub: Sub = (t) => {
      setItems((prev) => [...prev, t]);
      const timer = setTimeout(() => dismiss(t.id), t.durationMs);
      timers.current.set(t.id, timer);
    };
    subs.add(sub);
    const currentTimers = timers.current;
    return () => {
      subs.delete(sub);
      for (const timer of currentTimers.values()) clearTimeout(timer);
      currentTimers.clear();
    };
  }, [dismiss]);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
    >
      {items.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast: t, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  return (
    <div
      role={t.kind === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto w-[min(380px,90vw)] rounded-card border px-3.5 py-3 text-sm leading-snug shadow-overlay",
        palette[t.kind],
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill", dot[t.kind])} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{t.title}</div>
          {t.description && (
            <div className="mt-0.5 break-words text-muted">{t.description}</div>
          )}
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                onDismiss();
              }}
              className="mt-2 rounded-btn border border-hairline px-2.5 py-1 text-xs hover:bg-paper transition-colors"
            >
              {t.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="shrink-0 text-muted hover:text-ink transition-colors"
        >
          ×
        </button>
      </div>
    </div>
  );
}
