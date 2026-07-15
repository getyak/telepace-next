import { getTranslations } from "next-intl/server";

import { routes, siteConfig } from "@telepace/config";
import { Button } from "@telepace/ui";

import { PageHeader } from "@/components/marketing/site-chrome";
import { buildPageMetadata } from "@/lib/seo";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return buildPageMetadata({
    locale,
    path: routes.customers,
    namespace: "metadata.marketing.customers",
  });
}

const storyIds = ["northstar", "radicle", "pentagramLabs"] as const;
const statIds = ["interviewsRun", "companiesOnboarded", "avgTimeToInsight", "nps"] as const;

export default async function CustomersPage() {
  const t = await getTranslations("marketing.customers");

  const stats = statIds.map((id) => ({
    id,
    label: t(`stats.${id}.label`),
    value: t(`stats.${id}.value`),
  }));

  const stories = storyIds.map((id) => ({
    id,
    company: t(`stories.${id}.company`),
    role: t(`stories.${id}.role`),
    quote: t(`stories.${id}.quote`),
    person: t(`stories.${id}.person`),
    metric: t(`stories.${id}.metric`),
  }));

  return (
    <>
      <PageHeader
        eyebrow={t("hero.eyebrow")}
        title={t.rich("hero.title", {
          accent: (chunks) => <span className="italic text-accent">{chunks}</span>,
        })}
        lede={t("hero.lede")}
      />

      <section className="section-padding border-b border-hairline">
        <div className="container-content grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.id} className="border-t border-ink pt-4">
              <p className="font-display text-4xl">{s.value}</p>
              <p className="text-sm text-muted mt-2">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section-padding">
        <div className="container-content space-y-16">
          {stories.map((s, i) => (
            <div key={s.id} className="grid md:grid-cols-12 gap-10 items-start">
              <div className="md:col-span-4">
                <p className="overline mb-2">{s.role}</p>
                <p className="font-display text-4xl">{s.company}</p>
                <p className="mt-6 text-sm text-muted">— {s.person}</p>
                <div className="mt-3 inline-block px-3 py-1 rounded-pill bg-accent-soft text-accent text-xs">
                  {s.metric}
                </div>
              </div>
              <blockquote className="md:col-span-8 font-display text-2xl md:text-3xl leading-tight text-ink relative pl-8 border-l-2 border-accent">
                {s.quote}
              </blockquote>
              {i < stories.length - 1 && (
                <div className="md:col-span-12 border-b border-hairline mt-4" />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding text-center">
        <div className="container-content max-w-2xl">
          <h2 className="font-display text-4xl md:text-5xl">{t("cta.title")}</h2>
          <p className="mt-4 text-body">{t("cta.lede")}</p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href={routes.signup}><Button size="lg">{t("cta.startFree")}</Button></Link>
            <Link href={`mailto:${siteConfig.contact.helloEmail}`}><Button size="lg" variant="secondary">{t("cta.talkToFounder")}</Button></Link>
          </div>
        </div>
      </section>
    </>
  );
}
