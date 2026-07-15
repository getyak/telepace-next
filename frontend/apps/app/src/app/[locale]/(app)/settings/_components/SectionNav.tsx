"use client";

import { useRef } from "react";

type Section = { id: string; label: string };

/**
 * Settings section switcher. This is a real tablist, not a table of contents:
 * exactly one section is mounted at a time, so the nav is the only thing that
 * says "where am I / where can I go". Keyboard follows the ARIA tabs pattern
 * (roving tabindex, arrows wrap, Home/End) — activation follows focus, which
 * is correct here because switching a pane is cheap and non-destructive.
 */
export function SectionNav({
  sections,
  active,
  onSelect,
}: {
  sections: Section[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusAndSelect = (id: string) => {
    onSelect(id);
    refs.current[id]?.focus();
  };

  const onKeyDown = (evt: React.KeyboardEvent) => {
    const i = sections.findIndex((s) => s.id === active);
    if (i === -1) return;

    const next = {
      ArrowDown: (i + 1) % sections.length,
      ArrowRight: (i + 1) % sections.length,
      ArrowUp: (i - 1 + sections.length) % sections.length,
      ArrowLeft: (i - 1 + sections.length) % sections.length,
      Home: 0,
      End: sections.length - 1,
    }[evt.key];

    if (next === undefined) return;
    evt.preventDefault();
    focusAndSelect(sections[next].id);
  };

  return (
    <nav
      role="tablist"
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
      className="sticky top-6 flex gap-1 overflow-x-auto md:flex-col md:overflow-visible"
    >
      {sections.map((s) => {
        const isActive = s.id === active;
        const isDanger = s.id === "danger";
        return (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            role="tab"
            type="button"
            id={`tab-${s.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${s.id}`}
            tabIndex={isActive ? 0 : -1}
            // Focus follows the click so the arrow keys keep working for a
            // pointer user who then reaches for the keyboard.
            onClick={() => focusAndSelect(s.id)}
            className={[
              // Row rung — the tab dips ahead of the pane swap, so the press is
              // acknowledged before the content changes.
              "tp-press tp-press-row shrink-0 rounded-btn px-3 py-2 text-left text-sm",
              "transition-[background-color,color,transform] duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
              isActive
                ? "bg-paper-elevated font-medium text-ink"
                : isDanger
                  ? "text-body hover:bg-paper-elevated hover:text-terracotta"
                  : "text-body hover:bg-paper-elevated hover:text-ink",
            ].join(" ")}
          >
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}
