import { getTranslations } from "next-intl/server";

import { Button, Card } from "@telepace/ui";
import { siteConfig } from "@telepace/config";

import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/marketing/site-chrome";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.marketing.careers" });
  return { title: t("title"), description: t("description") };
}

const ROLE_IDS = ["voiceMlEngineer", "designer", "appliedResearchEngineer", "gtmSales"] as const;
const PRINCIPLE_IDS = ["craft", "direct", "ownOutcome", "sleep"] as const;

export default async function CareersPage() {
  const t = await getTranslations("marketing.careers");

  const roles = ROLE_IDS.map((id) => ({
    id,
    title: t(`roles.${id}.title`),
    location: t(`roles.${id}.location`),
    type: t(`roles.${id}.type`),
    summary: t(`roles.${id}.summary`),
    stack: t(`roles.${id}.stack`),
  }));

  const principles = PRINCIPLE_IDS.map((id) => ({
    id,
    k: t(`principles.${id}.title`),
    v: t(`principles.${id}.description`),
  }));

  return (
    <>
      <PageHeader
        eyebrow={t("hero.eyebrow")}
        title={<>{t("hero.titleLead")} <span className="italic text-accent">{t("hero.titleHighlight")}</span></>}
        lede={t("hero.lede")}
      />

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-2 gap-10">
          <div>
            <p className="overline mb-4">{t("howWeWork.eyebrow")}</p>
            <h2 className="font-display text-3xl mb-6">{t("howWeWork.title")}</h2>
            <dl className="space-y-6">
              {principles.map((p) => (
                <div key={p.id}>
                  <dt className="font-display text-lg mb-1">{p.k}</dt>
                  <dd className="text-body">{p.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <p className="overline mb-4">{t("offer.eyebrow")}</p>
            <h2 className="font-display text-3xl mb-6">{t("offer.title")}</h2>
            <div className="space-y-4 text-body">
              <p>{t("offer.compensation")}</p>
              <p>{t("offer.benefits")}</p>
              <p>{t("offer.remote")}</p>
              <p>{t("offer.trial")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content">
          <p className="overline mb-4">{t("openRoles.eyebrow")}</p>
          <h2 className="font-display text-4xl mb-10">{t("openRoles.title")}</h2>
          <div className="space-y-4">
            {roles.map((r) => (
              <Card key={r.id} className="p-6 md:flex md:items-start md:justify-between gap-6">
                <div className="flex-1">
                  <p className="font-display text-2xl">{r.title}</p>
                  <p className="text-sm text-muted mt-1">{r.location} · {r.type} · {r.stack}</p>
                  <p className="text-body mt-3 max-w-2xl">{r.summary}</p>
                </div>
                <div className="mt-4 md:mt-0">
                  <Link href={`mailto:${siteConfig.contact.hiringEmail}?subject=${t("openRoles.applySubject", { title: r.title })}`}>
                    <Button variant="secondary">{t("openRoles.apply")}</Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding text-center">
        <div className="container-content max-w-2xl">
          <h2 className="font-display text-3xl">{t("noRole.title")}</h2>
          <p className="mt-4 text-body">
            {t.rich("noRole.body", {
              email: siteConfig.contact.hiringEmail,
              link: (chunks) => (
                <Link href={`mailto:${siteConfig.contact.hiringEmail}`} className="text-accent underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </section>
    </>
  );
}
