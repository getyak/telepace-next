"use client";

/**
 * Language switcher — the quiet, editorial kind: two letterspaced text items
 * ("EN · 中文") where the current locale sits in ink and the other is a muted
 * link. No dropdown, no globe icon chrome — with exactly two locales a
 * dropdown is ceremony, and the native-script label ("中文", not "ZH") is the
 * one honest way to present a language to someone who can't read the current
 * one. Preserves the current path via next-intl's locale-aware Link.
 */

import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useLocale } from "next-intl";

const LOCALE_LABELS: Record<string, string> = {
  en: "EN",
  zh: "中文",
};

export function LocaleSwitch({
  /** Localized accessible label for the whole control, e.g. "Language". */
  navLabel,
  /** Localized per-locale link labels, e.g. { zh: "切换到中文" }. Serializable
   * (a plain record), so a server parent can pass it to this client leaf. */
  switchLabels,
}: {
  navLabel: string;
  switchLabels: Record<string, string>;
}) {
  const locale = useLocale();
  const pathname = usePathname();

  // tracking-wide from the token scale — no ad-hoc letterspacing values
  // (DESIGN.md: the overline is the only letterspaced label style).
  return (
    <nav aria-label={navLabel} className="flex items-center gap-2 text-xs tracking-wide">
      {routing.locales.map((l, i) => (
        <span key={l} className="flex items-center gap-2">
          {i > 0 && (
            <span aria-hidden className="text-faint">
              ·
            </span>
          )}
          {l === locale ? (
            <span aria-current="true" className="font-medium text-ink">
              {LOCALE_LABELS[l] ?? l.toUpperCase()}
            </span>
          ) : (
            <Link
              href={pathname}
              locale={l}
              aria-label={switchLabels[l]}
              className="tp-press-text rounded-input text-muted transition-[color,opacity] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              {LOCALE_LABELS[l] ?? l.toUpperCase()}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
