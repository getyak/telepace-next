"use client";

import { useEffect, useState } from "react";

type Section = { id: string; label: string };

export function SectionNav({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    // On any intersection change, pick the section whose heading sits
    // nearest the top of the viewport (accounting for the sticky offset).
    const pickNearest = () => {
      let bestId = elements[0].id;
      let bestDist = Infinity;
      for (const el of elements) {
        const dist = Math.abs(el.getBoundingClientRect().top - 96);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = el.id;
        }
      }
      setActive(bestId);
    };

    const observer = new IntersectionObserver(pickNearest, {
      rootMargin: "-96px 0px -60% 0px",
      threshold: [0, 1],
    });
    for (const el of elements) observer.observe(el);
    pickNearest();

    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="sticky top-6 space-y-1 text-sm">
      {sections.map((s) => {
        const isActive = s.id === active;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={isActive ? "true" : undefined}
            className={`block rounded-btn px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
              isActive
                ? "bg-paper-elevated text-ink font-medium"
                : "text-body hover:bg-paper-elevated hover:text-ink"
            }`}
          >
            {s.label}
          </a>
        );
      })}
    </nav>
  );
}
