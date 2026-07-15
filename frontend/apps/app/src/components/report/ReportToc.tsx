"use client";

/**
 * Sticky table of contents for the narrative report.
 *
 * Renders anchor links for each chapter and highlights the section currently
 * in view using an IntersectionObserver scroll-spy.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@telepace/ui";
import type { ReportChapter } from "./ReportView";

export function ReportToc({ chapters }: { chapters: ReportChapter[] }) {
  const t = useTranslations("app.report");
  const [activeId, setActiveId] = useState<string>(chapters[0]?.id ?? "");

  useEffect(() => {
    const sections = chapters
      .map((c) => document.getElementById(c.id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // Bias the active band toward the upper portion of the viewport so the
      // heading a reader is looking at is the one highlighted.
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [chapters]);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  }

  return (
    <nav aria-label={t("tableOfContents")} className="sticky top-10">
      <p className="overline mb-4">{t("tableOfContents")}</p>
      <ul className="space-y-1 border-l border-hairline">
        {chapters.map((chapter) => {
          const active = chapter.id === activeId;
          return (
            <li key={chapter.id}>
              <a
                href={`#${chapter.id}`}
                onClick={(e) => handleClick(e, chapter.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  // Origin-left: these hang off a shared rule on the left edge,
                  // so a centre-origin scale would pull them off the line.
                  "tp-press tp-press-row origin-left -ml-px block border-l-2 py-1.5 pl-4 text-sm leading-snug " +
                    "transition-[color,border-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                  active
                    ? "border-accent text-ink"
                    : "border-transparent text-muted hover:text-body active:text-ink",
                )}
              >
                {chapter.title}
              </a>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="mt-6 pl-4 text-xs text-muted transition-colors hover:text-ink active:text-ink/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        ↑ {t("backToTop")}
      </button>
    </nav>
  );
}
