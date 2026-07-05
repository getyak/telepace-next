"use client";

/**
 * Minimal, dependency-free toast system (design-token styled).
 *
 *   <Toaster />            // mount once in the root layout
 *   toast.error({ title, description, action? })
 *   toast.success(...)     // .warning, .info
 *
 * Kept transport-agnostic on purpose: app-level bridges (e.g. HTTP error
 * listeners) subscribe to their own event sources and call `toast.*`.
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

const kindAccent: Record<Kind, string> = {
  success: "text-success",
  error: "text-danger",
  warning: "text-warning",
  info: "text-body",
};

export function Toaster({ dismissLabel = "Dismiss" }: { dismissLabel?: string }) {
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
      className="pointer-events-none fixed right-4 top-4 z-[9999] flex flex-col gap-2"
    >
      {items.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} dismissLabel={dismissLabel} />
      ))}
    </div>
  );
}

function ToastCard({
  toast: t,
  onDismiss,
  dismissLabel,
}: {
  toast: ToastItem;
  onDismiss: () => void;
  dismissLabel: string;
}) {
  return (
    <div
      role={t.kind === "error" ? "alert" : "status"}
      className="pointer-events-auto w-[min(360px,calc(100vw-2rem))] rounded-card border border-hairline bg-paper-elevated p-3.5 text-sm text-ink shadow-overlay"
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-pill bg-current", kindAccent[t.kind])}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t.title}</p>
          {t.description ? (
            <p className="mt-0.5 break-words text-body">{t.description}</p>
          ) : null}
          {t.action ? (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                onDismiss();
              }}
              className="mt-2 rounded-btn border border-hairline px-2.5 py-1 text-xs text-body transition-colors hover:bg-paper hover:text-ink"
            >
              {t.action.label}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="-m-1 p-1 leading-none text-muted transition-colors hover:text-ink"
        >
          ×
        </button>
      </div>
    </div>
  );
}
