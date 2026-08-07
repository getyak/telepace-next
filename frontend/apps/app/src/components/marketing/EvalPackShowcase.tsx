import { getTranslations } from "next-intl/server";
import { Button } from "@telepace/ui";
import { routes } from "@telepace/config";

import { Link } from "@/i18n/navigation";
import { Reveal } from "./Reveal";

export async function EvalPackShowcase() {
  const t = await getTranslations("marketing.home.insights");
  return (
    <section className="section-padding border-t border-hairline bg-paper-elevated">
      <div className="container-content grid items-start gap-12 md:grid-cols-12">
        <div className="md:col-span-5">
          <Reveal>
            <p className="overline mb-4">{t("eyebrow")}</p>
            <h2 className="max-w-xl font-display text-4xl leading-tight md:text-5xl">{t("title")}</h2>
            <p className="mt-5 max-w-md text-body">{t("description")}</p>
            <div className="mt-7">
              <Link href={routes.signup}>
                <Button variant="secondary">{t("cta")}</Button>
              </Link>
            </div>
          </Reveal>
        </div>

        <div className="md:col-span-7">
          <Reveal delay={100}>
            <div className="overflow-hidden rounded-card border border-hairline bg-paper shadow-hairline">
              <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
                <div>
                  <p className="font-display text-lg">{t("panel.study")}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{t("panel.meta")}</p>
                </div>
                <span className="rounded-pill bg-accent-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
                  Eval Pack v1
                </span>
              </div>

              <div className="grid md:grid-cols-[0.9fr_1.1fr]">
                <div className="border-b border-hairline p-5 md:border-b-0 md:border-r">
                  <p className="overline">{t("panel.sourceLabel")}</p>
                  <figure className="mt-4">
                    <blockquote className="font-display text-xl leading-snug text-ink">
                      “{t("panel.quote.text")}”
                    </blockquote>
                    <figcaption className="mt-3 text-[11px] leading-relaxed text-muted">
                      {t("panel.quote.attribution")}
                    </figcaption>
                  </figure>
                  <div className="mt-5 border-t border-hairline pt-4">
                    <p className="font-mono text-[10px] text-muted">{t("panel.trace")}</p>
                  </div>
                </div>

                <div className="p-5">
                  <p className="overline">{t("panel.compiledLabel")}</p>
                  <div className="mt-4 divide-y divide-hairline border-y border-hairline">
                    {(["t1", "t2", "t3"] as const).map((id, index) => (
                      <div key={id} className="grid grid-cols-[1.5rem_1fr] gap-3 py-3.5">
                        <span className="font-mono text-[10px] text-muted">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {t(`panel.themes.${id}.title`)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted">
                            {t(`panel.themes.${id}.count`)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 font-mono text-[10px] text-accent">
                    {t("panel.exportHint")}
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
