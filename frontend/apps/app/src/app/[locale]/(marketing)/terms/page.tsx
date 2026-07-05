import { getTranslations } from "next-intl/server";

import { siteConfig } from "@telepace/config";

import { PageHeader } from "@/components/marketing/site-chrome";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.marketing.terms" });
  return { title: t("title"), description: t("description") };
}

const SECTION_IDS = [
  "acceptance",
  "service",
  "yourContent",
  "acceptableUse",
  "payment",
  "termination",
  "warranty",
  "liability",
  "governingLaw",
  "changes",
] as const;

export default async function TermsPage() {
  const t = await getTranslations("marketing.terms");

  return (
    <>
      <PageHeader
        eyebrow={t("hero.eyebrow")}
        title={<>{t("hero.title")}</>}
        lede={t("hero.lede")}
      />

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-12 gap-10">
          <aside className="md:col-span-3">
            <nav className="sticky top-24 space-y-2 text-sm">
              <p className="overline mb-3">{t("onThisPage")}</p>
              {SECTION_IDS.map((id) => (
                <a key={id} href={`#${id}`} className="block text-body hover:text-ink transition-colors">
                  {t(`sections.${id}.title`)}
                </a>
              ))}
            </nav>
          </aside>
          <div className="md:col-span-9 space-y-12">
            {SECTION_IDS.map((id) => (
              <div key={id} id={id}>
                <h2 className="font-display text-2xl mb-3">{t(`sections.${id}.title`)}</h2>
                <p className="text-body">{t(`sections.${id}.body`)}</p>
              </div>
            ))}
            <div className="border-t border-hairline pt-8 text-sm text-muted">
              {t.rich("legalQuestions", {
                email: () => (
                  <Link href={`mailto:${siteConfig.contact.legalEmail}`} className="text-accent underline">
                    {siteConfig.contact.legalEmail}
                  </Link>
                ),
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
