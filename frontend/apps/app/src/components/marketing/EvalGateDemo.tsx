"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const SLICES = ["overall", "refund", "missing", "escalation"] as const;
type Slice = (typeof SLICES)[number];

const SLICE_SCORE: Record<Slice, number> = {
  overall: 87,
  refund: 42,
  missing: 78,
  escalation: 91,
};

export function EvalGateDemo() {
  const t = useTranslations("marketing.home.heroDemo");
  const [active, setActive] = useState<Slice>("refund");

  return (
    <div className="rounded-well bg-desk p-3 shadow-overlay sm:p-4">
      <div className="overflow-hidden rounded-card border border-hairline bg-paper-elevated">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-terracotta" />
            <span className="text-xs font-medium text-body">{t("candidate")}</span>
          </div>
          <span className="rounded-pill bg-terracotta/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-terracotta">
            {t("decision")}
          </span>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-6 px-5 py-5">
          <div>
            <p className="overline">{t("releaseScore")}</p>
            <p className="mt-2 font-display text-5xl leading-none text-ink">
              {SLICE_SCORE[active]}
              <span className="ml-1 text-xl text-muted">/100</span>
            </p>
          </div>
          <p className="pb-1 font-mono text-xs text-accent">{t("delta")}</p>
        </div>

        <div
          className="grid grid-cols-4 border-y border-hairline"
          role="tablist"
          aria-label={t("slicesLabel")}
        >
          {SLICES.map((slice) => (
            <button
              key={slice}
              type="button"
              role="tab"
              aria-selected={active === slice}
              onClick={() => setActive(slice)}
              className={`border-r border-hairline px-2 py-3 text-left last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                active === slice ? "bg-paper-sunken" : "hover:bg-paper"
              }`}
            >
              <span className="block text-[10px] text-muted">{t(`slice_${slice}`)}</span>
              <span
                className={`mt-0.5 block font-mono text-xs ${
                  SLICE_SCORE[slice] < 70 ? "text-terracotta" : "text-ink"
                }`}
              >
                {SLICE_SCORE[slice]}
              </span>
            </button>
          ))}
        </div>

        <div className="p-5">
          <div className="border-l-2 border-terracotta bg-terracotta/[0.055] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-terracotta">{t("blocker")}</p>
              <span className="font-mono text-[10px] text-muted">{t("caseId")}</span>
            </div>
            <p className="mt-2 text-sm font-medium leading-relaxed text-ink">{t("blockerText")}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{t("blockerMeta")}</p>
          </div>

          <div className="mt-4 flex items-start gap-3">
            <span className="mt-0.5 rounded-pill bg-accent-soft px-2 py-0.5 font-mono text-[10px] text-accent">
              {t("evidenceLabel")}
            </span>
            <blockquote className="text-xs leading-relaxed text-body">
              “{t("evidenceQuote")}”
              <cite className="mt-1 block not-italic text-muted">{t("evidenceSource")}</cite>
            </blockquote>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-hairline bg-paper-sunken/60 px-5 py-3">
          <span className="text-[11px] text-muted">{t("gateRule")}</span>
          <span className="font-mono text-[11px] font-semibold text-terracotta">
            {t("gateResult")}
          </span>
        </div>
      </div>
    </div>
  );
}
