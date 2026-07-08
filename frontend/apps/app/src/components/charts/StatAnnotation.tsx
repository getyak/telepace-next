"use client";

import { useTranslations } from "next-intl";

export function SmallSampleWarning({ n }: { n: number }) {
  const t = useTranslations("app.charts");

  if (n >= 30) return null;

  return (
    <div className="flex items-start gap-2 rounded-card border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
      <span className="mt-0.5 shrink-0 font-mono text-xs">!</span>
      <p>{t("smallSampleWarning", { n })}</p>
    </div>
  );
}

export function MultiSelectTip() {
  const t = useTranslations("app.charts");

  return (
    <p className="text-xs italic text-muted">
      {t("multiSelectTip")}
    </p>
  );
}

export function Top2BoxNote() {
  const t = useTranslations("app.charts");

  return (
    <p className="text-xs text-muted">
      {t("top2BoxNote")}
    </p>
  );
}
