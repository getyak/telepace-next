import { getTranslations } from "next-intl/server";
import { siteConfig } from "@telepace/config";

import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/marketing/site-chrome";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.marketing.changelog" });
  return { title: t("title"), description: t("description") };
}

const entryIds = [
  "mcpAskFollowup",
  "voiceInterviewsGa",
  "coverageTrackerRewrite",
  "notionLinearIntegrations",
  "publicLaunch",
] as const;

const entryMeta: Record<(typeof entryIds)[number], { date: string; tag: "release" | "improvement" | "fix" }> = {
  mcpAskFollowup: { date: "2026-06-28", tag: "release" },
  voiceInterviewsGa: { date: "2026-06-14", tag: "release" },
  coverageTrackerRewrite: { date: "2026-06-02", tag: "improvement" },
  notionLinearIntegrations: { date: "2026-05-20", tag: "release" },
  publicLaunch: { date: "2026-05-05", tag: "release" },
};

const entryItemCounts: Record<(typeof entryIds)[number], number> = {
  mcpAskFollowup: 3,
  voiceInterviewsGa: 3,
  coverageTrackerRewrite: 2,
  notionLinearIntegrations: 2,
  publicLaunch: 3,
};

const tagStyles: Record<string, string> = {
  release: "bg-accent-soft text-accent border-accent/30",
  improvement: "bg-paper-sunken text-body border-hairline",
  fix: "bg-paper-sunken text-body border-hairline",
};

export default async function ChangelogPage() {
  const t = await getTranslations("marketing.changelog");

  return (
    <>
      <PageHeader
        eyebrow={t("hero.eyebrow")}
        title={<>{t("hero.title")}</>}
        lede={t("hero.lede")}
      />

      <section className="section-padding">
        <div className="container-content max-w-3xl space-y-14">
          {entryIds.map((id) => {
            const meta = entryMeta[id];
            const itemCount = entryItemCounts[id];
            return (
              <article key={id} className="grid md:grid-cols-12 gap-6 items-start">
                <div className="md:col-span-3 text-sm text-muted font-mono">{meta.date}</div>
                <div className="md:col-span-9">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`inline-block px-2.5 py-0.5 rounded-pill border text-xs ${tagStyles[meta.tag]}`}>
                      {t(`tags.${meta.tag}`)}
                    </span>
                  </div>
                  <h2 className="font-display text-2xl mb-3">{t(`entries.${id}.title`)}</h2>
                  <p className="text-body mb-4">{t(`entries.${id}.body`)}</p>
                  <ul className="text-sm text-body space-y-1">
                    {Array.from({ length: itemCount }).map((_, i) => (
                      <li key={i}>· {t(`entries.${id}.items.${i}`)}</li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content max-w-2xl text-center">
          <p className="overline mb-3">{t("cta.eyebrow")}</p>
          <h2 className="font-display text-3xl mb-4">{t("cta.title")}</h2>
          <p className="text-body">
            {t.rich("cta.body", {
              email: () => (
                <Link
                  href={`mailto:${siteConfig.contact.featureRequestEmail}`}
                  className="text-accent underline"
                >
                  {siteConfig.contact.featureRequestEmail}
                </Link>
              ),
            })}
          </p>
        </div>
      </section>
    </>
  );
}
