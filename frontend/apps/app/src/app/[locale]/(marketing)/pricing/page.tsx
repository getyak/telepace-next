import { getTranslations } from "next-intl/server";

import { routes, siteConfig } from "@telepace/config";
import { Button, Card } from "@telepace/ui";

import { PageHeader } from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildPageMetadata, faqPageSchema } from "@/lib/seo";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return buildPageMetadata({
    locale,
    path: routes.pricing,
    namespace: "metadata.marketing.pricing",
  });
}

const tierIds = ["free", "pro", "team", "enterprise"] as const;

const tierMeta: Record<
  (typeof tierIds)[number],
  {
    price: string;
    cadence: string;
    ctaHref: string;
    highlight?: boolean;
    featureIds: string[];
  }
> = {
  free: {
    price: "$0",
    cadence: "/month",
    ctaHref: routes.signup,
    featureIds: ["studiesPerMonth", "completionsPerStudy", "textLinkChannels", "communitySupport", "watermark"],
  },
  pro: {
    price: "$79",
    cadence: "/month",
    ctaHref: `${routes.signup}?plan=pro`,
    highlight: true,
    featureIds: [
      "unlimitedStudies",
      "completions500",
      "voicePhoneEmailChannels",
      "mcpRestApi",
      "notionLinearIntegrations",
      "prioritySupport",
    ],
  },
  team: {
    price: "$249",
    cadence: "/month",
    ctaHref: `mailto:${siteConfig.contact.helloEmail}`,
    featureIds: [
      "everythingInPro",
      "seatsAndSso",
      "completions2500",
      "sharedInsightLibrary",
      "customSkillPackaging",
      "slaSlackChannel",
    ],
  },
  enterprise: {
    price: "Custom",
    cadence: "",
    ctaHref: `mailto:${siteConfig.contact.salesEmail}`,
    featureIds: [
      "selfHostedVpc",
      "soc2Dpa",
      "fineTunedInterviewer",
      "dedicatedCsm",
      "customRetentionResidency",
      "volumePricing",
    ],
  },
};

const faqIds = ["completionDefinition", "byoLlmKey", "phoneMinutes", "cancellation", "dataTraining"] as const;

export default async function PricingPage() {
  const t = await getTranslations("marketing.pricing");

  const faqItems = faqIds.map((id) => ({
    question: t(`faq.items.${id}.question`),
    answer: t(`faq.items.${id}.answer`),
  }));

  return (
    <>
      <JsonLd data={faqPageSchema(faqItems)} />
      <PageHeader
        eyebrow={t("hero.eyebrow")}
        title={
          <>
            {t("hero.titleLine1")} <span className="italic text-accent">{t("hero.titleLine2")}</span>
          </>
        }
        lede={t("hero.lede")}
      />

      <section className="section-padding">
        <div className="container-content grid gap-6 md:grid-cols-4">
          {tierIds.map((id) => {
            const meta = tierMeta[id];
            return (
              <Card
                key={id}
                className={
                  "relative flex flex-col p-8 " +
                  (meta.highlight ? "border-ink bg-ink text-paper" : "")
                }
              >
                {meta.highlight && (
                  <span className="absolute -top-3 left-8 inline-block rounded-pill bg-paper/15 text-paper overline px-2.5 py-1">
                    {t("tiers.pro.badge")}
                  </span>
                )}
                <p className={"overline " + (meta.highlight ? "text-paper/70" : "")}>
                  {t(`tiers.${id}.name`)}
                </p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-5xl">{meta.price}</span>
                  <span className={meta.highlight ? "text-paper/60 text-sm" : "text-muted text-sm"}>
                    {meta.cadence}
                  </span>
                </div>
                <p className={"mt-3 text-sm " + (meta.highlight ? "text-paper/80" : "text-body")}>
                  {t(`tiers.${id}.tagline`)}
                </p>
                <ul className="mt-8 space-y-3 text-sm flex-1">
                  {meta.featureIds.map((featureId) => (
                    <li key={featureId} className="flex gap-3">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={"mt-1 shrink-0 " + (meta.highlight ? "text-accent-soft" : "text-accent")}
                      >
                        <path d="M4 10.5l4 4 8-9" />
                      </svg>
                      <span className={meta.highlight ? "text-paper/90" : "text-body"}>
                        {t(`features.${featureId}`)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href={meta.ctaHref} className="mt-8">
                  <Button
                    className="w-full"
                    variant={meta.highlight ? "inverse" : "secondary"}
                  >
                    {t(`tiers.${id}.ctaLabel`)}
                  </Button>
                </Link>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content max-w-3xl">
          <p className="overline mb-4">{t("faq.eyebrow")}</p>
          <h2 className="font-display text-4xl mb-10">{t("faq.title")}</h2>
          <dl className="divide-y divide-hairline border-t border-b border-hairline">
            {faqIds.map((id) => (
              <div key={id} className="py-6">
                <dt className="font-display text-xl mb-2">{t(`faq.items.${id}.question`)}</dt>
                <dd className="text-body">{t(`faq.items.${id}.answer`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section-padding text-center">
        <div className="container-content max-w-2xl">
          <h2 className="font-display text-4xl md:text-5xl">{t("cta.title")}</h2>
          <p className="mt-4 text-body">{t("cta.lede")}</p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href={routes.signup}>
              <Button size="lg">{t("cta.startFree")}</Button>
            </Link>
            <Link href={routes.demo}>
              <Button size="lg" variant="secondary">
                {t("cta.seeDemo")}
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
