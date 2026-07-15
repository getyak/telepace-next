import { getTranslations } from "next-intl/server";

import { routes, siteConfig } from "@telepace/config";

import { PageHeader } from "@/components/marketing/site-chrome";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return buildPageMetadata({
    locale,
    path: routes.privacy,
    namespace: "metadata.marketing.privacy",
  });
}

const SECTION_IDS = [
  "whatWeCollect",
  "howWeUseIt",
  "sharing",
  "yourRights",
  "retention",
  "changes",
] as const;

export default async function PrivacyPage() {
  const t = await getTranslations("marketing.privacy");

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
          <div className="md:col-span-9 max-w-prose space-y-12">
            {SECTION_IDS.map((id) => (
              <div key={id} id={id} className="scroll-mt-24">
                <h2 className="font-display text-2xl mb-3">{t(`sections.${id}.title`)}</h2>
                <div className="space-y-3 text-body leading-relaxed">
                  {t.raw(`sections.${id}.body`).map((p: string) => <p key={p}>{p}</p>)}
                </div>
              </div>
            ))}
            <div className="border-t border-hairline pt-8 text-sm text-muted">
              {t.rich("questionsEmail", {
                email: () => (
                  <Link href={`mailto:${siteConfig.contact.privacyEmail}`} className="text-accent underline">
                    {siteConfig.contact.privacyEmail}
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
