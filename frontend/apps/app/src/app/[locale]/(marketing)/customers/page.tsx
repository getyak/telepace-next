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

// Honesty contract: no fabricated customers, quotes, or metrics. Until real
// customers agree to be named, this page states that plainly and shows only
// verifiable product facts (same policy as the home TrustBar).
const statIds = ["channels", "launchTime", "surfaces"] as const;
const partnerPointIds = ["point1", "point2", "point3"] as const;

export default async function CustomersPage() {
  const t = await getTranslations("marketing.customers");

  const stats = statIds.map((id) => ({
    id,
    label: t(`stats.${id}.label`),
    value: t(`stats.${id}.value`),
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
        <div className="container-content grid grid-cols-1 gap-8 sm:grid-cols-3">
          {/* House data style (the Audience-page standard, see home TrustBar):
              caption ABOVE the numeral, small caps with a top rule. */}
          {stats.map((s) => (
            <div key={s.id}>
              <p className="overline mb-2 border-t border-ink/20 pt-2">{s.label}</p>
              <p className="font-display text-4xl">{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-12 gap-10 items-start">
          <div className="md:col-span-5">
            <p className="overline mb-5">{t("designPartner.eyebrow")}</p>
            <h2 className="font-display text-4xl md:text-5xl leading-tight">
              {t("designPartner.title")}
            </h2>
          </div>
          <div className="md:col-span-7 max-w-2xl">
            <p className="text-body text-lg leading-relaxed">{t("designPartner.lede")}</p>
            <ul className="mt-8 space-y-3">
              {partnerPointIds.map((id) => (
                <li key={id} className="border-t border-hairline pt-3 text-body">
                  {t(`designPartner.${id}`)}
                </li>
              ))}
            </ul>
          </div>
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
