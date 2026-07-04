"use client";

/**
 * Minimal, dependency-free toast system.
 *
 *   <Toaster />            // mount once in the root layout
 *   toast.error({ title, description, action? })
 *   toast.success(...)     // .warning, .info
 */

import { useEffect, useRef, useState } from "react";
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

// ---------- Module-level pub/sub (so plain functions can push) -------------

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

// ---------- The rendered Toaster ------------------------------------------

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const sub: Sub = (t) => {
      setItems((prev) => [...prev, t]);
      const timer = setTimeout(() => dismiss(t.id), t.durationMs);
      timers.current.set(t.id, timer);
    };
    subs.add(sub);
    const currentTimers = timers.current;
    return () => {
      subs.delete(sub);
      for (const t of currentTimers.values()) clearTimeout(t);
      currentTimers.clear();
    };
  }, []);

  function dismiss(id: number) {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((t) => t.id !== id));
  }

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

const palette: Record<Kind, string> = {
  success: "border-success/30 bg-paper-elevated text-success",
  error: "border-danger/30 bg-paper-elevated text-danger",
  warning: "border-warning/30 bg-paper-elevated text-warning",
  info: "border-hairline bg-paper-elevated text-ink",
};

const icon: Record<Kind, string> = {
  success: "✓",
  error: "✕",
  warning: "!",
  info: "i",
};

function ToastCard({ toast: t, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  return (
    <div
      role={t.kind === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto min-w-[280px] max-w-[380px] rounded-card border shadow-overlay px-4 py-3 text-[13px] leading-relaxed",
        palette[t.kind],
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5" aria-hidden>
          {icon[t.kind]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-ink">{t.title}</div>
          {t.description ? (
            <div className="mt-0.5 text-body break-words">{t.description}</div>
          ) : null}
          {t.action ? (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                onDismiss();
              }}
              className="mt-2 rounded-btn border border-hairline px-2.5 py-1 text-xs text-ink hover:bg-paper transition-colors"
            >
              {t.action.label}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="text-muted hover:text-ink transition-colors leading-none text-base"
        >
          ×
        </button>
      </div>
    </div>
  );
}
