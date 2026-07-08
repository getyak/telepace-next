/**
 * The page's one big visual moment: a faithful HTML rebuild of an insights
 * panel — themes, confidence, verbatims — so visitors see what telepace
 * actually hands back. Rebuilt in HTML (not a screenshot) so it stays
 * crisp, localizes with next-intl, and costs nothing to maintain.
 */

import { getTranslations } from "next-intl/server";
import { Button } from "@telepace/ui";
import { routes } from "@telepace/config";

import { Link } from "@/i18n/navigation";

const THEME_KEYS = ["t1", "t2", "t3"] as const;
// Static widths for the confidence meters — synthetic sample data.
const CONFIDENCE = { t1: 86, t2: 74, t3: 71 } as const;

export async function InsightsShowcase() {
  const t = await getTranslations("marketing.home.insights");

  return (
    <section className="section-padding border-t border-hairline bg-paper-elevated">
      <div className="container-content grid items-start gap-10 md:grid-cols-12">
        <div className="md:col-span-4">
          <p className="overline mb-4">{t("eyebrow")}</p>
          <h2 className="font-display text-4xl md:text-5xl">{t("title")}</h2>
          <p className="mt-5 text-body max-w-md">{t("description")}</p>
          <div className="mt-6">
            <Link href={routes.demo}>
              <Button variant="secondary">{t("cta")}</Button>
            </Link>
          </div>
        </div>

        <div className="md:col-span-8">
          <div className="overflow-hidden rounded-card border border-hairline bg-paper shadow-hairline">
            {/* Panel chrome */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3.5">
              <p className="font-display text-lg">{t("panel.study")}</p>
              <p className="text-xs text-muted">{t("panel.meta")}</p>
            </div>

            {/* Themes with confidence meters */}
            <div className="divide-y divide-hairline">
              {THEME_KEYS.map((key) => (
                <div key={key} className="px-5 py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-[15px] font-medium text-ink">
                      {t(`panel.themes.${key}.title`)}
                    </p>
                    <p className="shrink-0 text-xs text-muted">
                      {t(`panel.themes.${key}.count`)}
                    </p>
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="h-1 flex-1 rounded-pill bg-paper-sunken">
                      <div
                        className="h-1 rounded-pill bg-accent"
                        style={{ width: `${CONFIDENCE[key]}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-xs text-muted">
                      0.{CONFIDENCE[key]}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* One expanded verbatim — the human voice inside the data */}
            <figure className="border-t border-hairline bg-paper-elevated px-5 py-5">
              <blockquote className="font-display text-xl leading-snug text-ink">
                “{t("panel.quote.text")}”
              </blockquote>
              <figcaption className="mt-2.5 text-xs text-muted">
                {t("panel.quote.attribution")}
              </figcaption>
            </figure>

            {/* Where it lands */}
            <div className="flex items-center justify-between border-t border-hairline px-5 py-3">
              <p className="text-xs text-muted">{t("panel.exportHint")}</p>
              <p className="font-mono text-xs text-muted">MCP · Notion · Linear</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
