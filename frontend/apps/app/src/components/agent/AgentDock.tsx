"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@telepace/ui";

import { usePathname } from "@/i18n/navigation";
import { GlobalAgentPanel } from "./GlobalAgentPanel";

/**
 * The always-present global agent affordance: a floating trigger bottom-right
 * that opens a right-side chat drawer.
 *
 * apple-design notes:
 * - The drawer is a translucent material (backdrop-blur) floating over the app,
 *   not an opaque strip — content behind it stays perceptible (§12).
 * - Open/close use an iOS-sheet cubic-bezier that reads as a spring settle, and
 *   the panel scales from its trigger origin (bottom-right) so the spatial
 *   relationship button→panel is obvious (§7). Enter and exit share the path.
 * - A scrim dims (not blocks) the background for focus; Escape and scrim-click
 *   both dismiss (agency + wayfinding).
 * - Under prefers-reduced-motion the transform is dropped for a plain fade.
 */
export function AgentDock() {
  const t = useTranslations("app.agent");
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // The full-screen study studio (/studies/new*) is the deep-authoring surface
  // (方案 B): it already owns the whole viewport with its own chat rail, so the
  // floating dock would collide with it. Hide the dock there — the studio is
  // where heavy authoring lives; the dock covers quick, cross-study actions
  // everywhere else.
  const hidden = pathname.startsWith("/studies/new");

  // Close on Escape whenever open (never trap the user).
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (hidden) return null;

  return (
    <>
      {/* Floating trigger — responds on press (scale), lives out of content flow. */}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full",
          "bg-ink text-paper shadow-overlay",
          "transition-[transform,opacity] duration-200 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
          "transform-gpu hover:scale-105 active:scale-95",
          "motion-reduce:transition-opacity motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent",
          open && "scale-90 opacity-0 pointer-events-none",
        )}
        aria-label={t("openLabel")}
      >
        <SparkIcon />
      </button>

      {/* Scrim: dims to focus, click to dismiss. Fades only (no transform). */}
      <div
        aria-hidden={!open}
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-ink/20 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      />

      {/* Drawer: translucent material, springs in from the trigger origin. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("panelLabel")}
        className={cn(
          "tp-chrome fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[420px] flex-col",
          "border-l border-hairline shadow-overlay",
          "origin-bottom-right transition-[transform,opacity] duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
          "motion-reduce:transition-opacity",
          open
            ? "translate-x-0 opacity-100"
            : "translate-x-3 scale-[0.98] opacity-0 pointer-events-none motion-reduce:translate-x-0 motion-reduce:scale-100",
        )}
      >
        <header className="flex min-h-14 items-center justify-between border-b border-hairline px-4">
          <div className="flex items-center gap-2">
            <SparkIcon className="text-accent" />
            <p className="font-serif text-lg text-ink">{t("title")}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("closeLabel")}
            className="rounded-input px-2 py-1 text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            ✕
          </button>
        </header>
        {/* Mount the panel only while open so a closed drawer holds no live
            stream; the conversation resets between sessions (MVP). */}
        {open && <GlobalAgentPanel className="min-h-0 flex-1" />}
      </aside>
    </>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8" />
    </svg>
  );
}
