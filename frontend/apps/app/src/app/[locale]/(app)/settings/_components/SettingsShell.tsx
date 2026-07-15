"use client";

import { useState } from "react";

import { SectionNav } from "./SectionNav";

type Section = { id: string; label: string; description: string };

/**
 * Owns which settings section is showing. Nav + panel are siblings here so the
 * page itself stays a server component: each pane is passed in pre-rendered
 * (server-translated), and this only decides which one is mounted.
 */
export function SettingsShell({
  sections,
  panels,
}: {
  sections: Section[];
  panels: Record<string, React.ReactNode>;
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const current = sections.find((s) => s.id === active) ?? sections[0];

  return (
    <div className="grid gap-8 md:grid-cols-12 md:gap-10">
      <aside className="md:col-span-3">
        <SectionNav
          sections={sections.map(({ id, label }) => ({ id, label }))}
          active={active}
          onSelect={setActive}
        />
      </aside>

      <div className="md:col-span-9">
        <div
          role="tabpanel"
          id={`panel-${current.id}`}
          aria-labelledby={`tab-${current.id}`}
          tabIndex={-1}
          // Keyed remount: each pane fades in once on switch, then rests.
          // Motion is the section's arrival, not decoration.
          key={current.id}
          className="tp-fade-in-up focus-visible:outline-none"
        >
          <header className="mb-5">
            <h2
              className={`font-display text-2xl ${
                current.id === "danger" ? "text-terracotta" : ""
              }`}
            >
              {current.label}
            </h2>
            <p className="mt-1 text-sm text-muted">{current.description}</p>
          </header>

          {panels[current.id]}
        </div>
      </div>
    </div>
  );
}
