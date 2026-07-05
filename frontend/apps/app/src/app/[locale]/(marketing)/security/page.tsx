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
  const t = await getTranslations({ locale, namespace: "metadata.marketing.security" });
  return { title: t("title"), description: t("description") };
}

const PILLAR_IDS = [
  "dataIsolation",
  "encryption",
  "piiRedaction",
  "accessControl",
  "modelTraining",
  "incidentResponse",
] as const;

const CERTIFICATION_IDS = ["soc2", "gdpr", "hipaa", "iso27001"] as const;

export default async function SecurityPage() {
  const t = await getTranslations("marketing.security");

  const pillars = PILLAR_IDS.map((id) => ({
    id,
    k: t(`pillars.${id}.title`),
    v: t(`pillars.${id}.description`),
  }));

  const certifications = CERTIFICATION_IDS.map((id) => ({
    id,
    name: t(`certifications.items.${id}.name`),
    status: t(`certifications.items.${id}.status`),
  }));

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={<>{t("titlePrefix")} <span className="italic text-accent">{t("titleEmphasis")}</span></>}
        lede={t("lede")}
      />

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-2 gap-6">
          {pillars.map((p) => (
            <div key={p.id} className="rounded-card border border-hairline bg-paper-elevated p-6">
              <p className="font-display text-2xl mb-3">{p.k}</p>
              <p className="text-body">{p.v}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content max-w-3xl">
          <p className="overline mb-4">{t("certifications.eyebrow")}</p>
          <h2 className="font-display text-3xl mb-8">{t("certifications.title")}</h2>
          <dl className="divide-y divide-hairline border-t border-b border-hairline">
            {certifications.map((c) => (
              <div key={c.id} className="py-5 flex justify-between gap-6">
                <dt className="font-display text-xl">{c.name}</dt>
                <dd className="text-body text-sm text-right max-w-xs">{c.status}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-content max-w-3xl space-y-6">
          <p className="overline">{t("disclosure.eyebrow")}</p>
          <h2 className="font-display text-3xl">{t("disclosure.title")}</h2>
          <p className="text-body">
            {t.rich("disclosure.reportText", {
              link: (chunks) => (
                <Link href={`mailto:${siteConfig.contact.securityEmail}`} className="text-accent underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
          <p className="text-body">
            {t.rich("disclosure.pgpText", {
              code: () => <code className="font-mono text-sm text-ink">{siteConfig.contact.pgpFingerprint}</code>,
              link: (chunks) => (
                <Link href={siteConfig.urls.pgpKeyserver} className="text-accent underline">
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
