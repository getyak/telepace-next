"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { cn } from "@telepace/ui";

import { usePathname } from "@/i18n/navigation";

// The panel pulls in ChatComposer + the agent-chat streaming client, none of
// which the drawer needs until it's actually opened. AgentDock lives in the app
// layout, so a static import would put that weight in every app page's first
// load. Lazy-load it (client-only; the panel is already gated on `open`).
const GlobalAgentPanel = dynamic(
  () => import("./GlobalAgentPanel").then((m) => m.GlobalAgentPanel),
  { ssr: false },
);

/**
 * The always-present global agent affordance: a floating trigger bottom-right
 * that opens a right-side chat drawer.
 *
 * Interaction notes:
 * - The drawer is an opaque work surface so dense mobile pages cannot bleed
 *   through and reduce chat contrast.
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
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const drawerRef = React.useRef<HTMLElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  // The full-screen study studio (/studies/new*) is the deep-authoring surface
  // (方案 B): it already owns the whole viewport with its own chat rail, so the
  // floating dock would collide with it. Hide the dock there — the studio is
  // where heavy authoring lives; the dock covers quick, cross-study actions
  // everywhere else.
  const hidden = pathname.startsWith("/studies/new");

  const closePanel = React.useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  // Keep keyboard focus inside the modal drawer and restore it to the trigger
  // when the researcher closes the assistant.
  React.useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePanel();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],textarea:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePanel, open]);

  if (hidden) return null;

  return (
    <>
      {/* Floating trigger — responds on press (scale), lives out of content flow. */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        tabIndex={open ? -1 : 0}
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full print:hidden",
          "bg-ink text-paper shadow-overlay",
          "transition-[transform,opacity] duration-200 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
          "tp-press tp-press-icon hover:scale-105",
          "motion-reduce:transition-opacity motion-reduce:hover:scale-100",
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
        onClick={closePanel}
        className={cn(
          "fixed inset-0 z-40 bg-ink/20 transition-opacity duration-200 print:hidden",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      />

      {/* Do not leave a hidden aria-modal dialog in the accessibility tree. */}
      {open && (
        <aside
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("panelLabel")}
          className={cn(
            "fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[420px] flex-col bg-paper print:hidden",
            "border-l border-hairline shadow-overlay",
            "origin-bottom-right tp-fade-in-up motion-reduce:animate-none",
          )}
        >
          <header className="flex min-h-14 items-center justify-between border-b border-hairline px-4">
            <div className="flex items-center gap-2">
              <SparkIcon className="text-accent" />
              <p className="font-serif text-lg text-ink">{t("title")}</p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={closePanel}
              aria-label={t("closeLabel")}
              className="tp-press tp-press-icon rounded-input px-2 py-1 text-sm text-muted transition-[color,transform] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              ✕
            </button>
          </header>
          <GlobalAgentPanel className="min-h-0 flex-1" />
        </aside>
      )}
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
