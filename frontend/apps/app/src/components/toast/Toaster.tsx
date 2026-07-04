"use client";

/**
 * Minimal, dependency-free toast system.
 *
 *   <Toaster />            // mount once in the root layout
 *   toast.error({ title, description, action? })
 *   toast.success(...)     // .warning, .info
 *
 * Also auto-listens to `onHttpEvent`: any classified ApiError bubbling up
 * from the HTTP layer becomes a toast with the right kind + copy, without
 * every call site having to catch and forward manually.
 */

import { useEffect, useRef, useState } from "react";

import { friendlyMessage } from "../../lib/errors";
import { onHttpEvent } from "../../lib/http";

type Kind = "success" | "error" | "warning" | "info";

export type Toast = {
  id: number;
  kind: Kind;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  durationMs: number;
};

type ToastInput = Omit<Toast, "id" | "kind" | "durationMs"> & {
  durationMs?: number;
};

// ---------- Module-level pub/sub (so plain functions can push) -------------

type Sub = (t: Toast) => void;
const subs = new Set<Sub>();
let idSeq = 1;

function push(kind: Kind, input: ToastInput): number {
  const t: Toast = {
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
  const [items, setItems] = useState<Toast[]>([]);
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

  // Bridge every classified HTTP error to a toast.
  useEffect(() => {
    let lastAuthAt = 0;
    const off = onHttpEvent((evt) => {
      if (evt.type === "auth:expired") {
        const now = Date.now();
        if (now - lastAuthAt < 2000) return; // de-dupe parallel 401s
        lastAuthAt = now;
        toast.error({
          title: "登录已过期",
          description: "请重新登录以继续操作。",
          durationMs: 8000,
        });
        return;
      }
      if (evt.type === "api:error") {
        if (evt.error.kind === "AUTH") return; // handled above
        if (evt.error.kind === "CANCELED") return; // usually user-initiated
        const copy = friendlyMessage(evt.error);
        toast.error({ title: copy.title, description: copy.description });
      }
    });
    return off;
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
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {items.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({
  toast: t,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const palette = paletteFor(t.kind);
  return (
    <div
      role={t.kind === "error" ? "alert" : "status"}
      style={{
        pointerEvents: "auto",
        minWidth: 280,
        maxWidth: 380,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.text,
        borderRadius: 8,
        padding: "12px 14px",
        boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ marginTop: 1 }} aria-hidden>
          {iconFor(t.kind)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{t.title}</div>
          {t.description ? (
            <div style={{ opacity: 0.8, marginTop: 2, wordBreak: "break-word" }}>
              {t.description}
            </div>
          ) : null}
          {t.action ? (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                onDismiss();
              }}
              style={{
                marginTop: 8,
                background: "transparent",
                border: `1px solid ${palette.border}`,
                borderRadius: 6,
                padding: "4px 10px",
                color: palette.text,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {t.action.label}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="关闭"
          onClick={onDismiss}
          style={{
            background: "transparent",
            border: "none",
            color: palette.text,
            opacity: 0.5,
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function paletteFor(kind: Kind) {
  switch (kind) {
    case "success":
      return { bg: "#f0fdf4", border: "#86efac", text: "#166534" };
    case "error":
      return { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" };
    case "warning":
      return { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" };
    case "info":
    default:
      return { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af" };
  }
}

function iconFor(kind: Kind): string {
  switch (kind) {
    case "success":
      return "✓";
    case "error":
      return "✕";
    case "warning":
      return "!";
    case "info":
    default:
      return "i";
  }
}
