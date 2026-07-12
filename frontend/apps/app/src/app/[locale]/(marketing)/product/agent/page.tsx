import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Button, Card } from "@telepace/ui";
import { routes } from "@telepace/config";
import { PageHeader } from "@/components/marketing/site-chrome";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.marketing.productAgent" });
  return { title: t("title"), description: t("description") };
}

const AGENT_IDS = ["designer", "interviewer", "analyst", "coordinator"] as const;

const POLICY_IDS = ["budget", "pii", "escalation", "observability"] as const;

export default async function AgentPage() {
  const t = await getTranslations("marketing.productAgent");

  const agents = AGENT_IDS.map((id) => ({
    id,
    name: t(`team.agents.${id}.name`),
    role: t(`team.agents.${id}.role`),
    inputs: t(`team.agents.${id}.inputs`),
    outputs: t(`team.agents.${id}.outputs`),
  }));

  const policies = POLICY_IDS.map((id) => ({
    id,
    k: t(`harness.policies.${id}.k`),
    v: t(`harness.policies.${id}.v`),
  }));

  return (
    <>
      <PageHeader
        eyebrow={t("hero.eyebrow")}
        title={<>{t("hero.titleLead")} <span className="italic text-accent">{t("hero.titleEmphasis")}</span></>}
        lede={t("hero.lede")}
      />

      <section className="section-padding">
        <div className="container-content">
          <p className="overline mb-4">{t("team.eyebrow")}</p>
          <h2 className="font-display text-4xl mb-12 max-w-2xl">
            {t("team.title")}
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {agents.map((a) => (
              <Card key={a.id} className="p-6">
                <p className="font-display text-2xl mb-3">{a.name}</p>
                <p className="text-body text-sm mb-5">{a.role}</p>
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="rounded-btn bg-paper-sunken p-3">
                    <p className="overline mb-1 text-muted">{t("team.consumes")}</p>
                    <p className="text-body">{a.inputs}</p>
                  </div>
                  <div className="rounded-btn bg-paper-sunken p-3">
                    <p className="overline mb-1 text-muted">{t("team.emits")}</p>
                    <p className="text-body">{a.outputs}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content grid md:grid-cols-12 gap-10">
          <div className="md:col-span-6">
            <p className="overline mb-4">{t("harness.eyebrow")}</p>
            <h2 className="font-display text-4xl mb-6">{t("harness.title")}</h2>
            <div className="space-y-4 text-body">
              <p>
                {t("harness.paragraph1Lead")} <span className="font-mono">{t("harness.harnessTerm")}</span>
                {t("harness.paragraph1Rest")}
              </p>
              <p>
                {t("harness.paragraph2")}
              </p>
              <p>
                {t("harness.paragraph3")}
              </p>
            </div>
            <div className="mt-6"><Link href={routes.docs}><Button variant="secondary">{t("harness.docsCta")}</Button></Link></div>
          </div>
          <div className="md:col-span-6">
            <div className="rounded-card border border-hairline bg-paper p-6">
              <p className="overline mb-4">{t("harness.policiesEyebrow")}</p>
              <dl className="divide-y divide-hairline">
                {policies.map((p) => (
                  <div key={p.id} className="py-4 flex gap-6">
                    <dt className="font-display text-lg text-ink w-32 shrink-0">{p.k}</dt>
                    <dd className="text-body text-sm">{p.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding text-center">
        <div className="container-content max-w-2xl">
          <h2 className="font-display text-4xl md:text-5xl">{t("cta.title")}</h2>
          <p className="mt-4 text-body">
            {t("cta.body")}
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href={routes.mcp}><Button size="lg">{t("cta.browseMcp")}</Button></Link>
            <Link href={routes.signup}><Button size="lg" variant="secondary">{t("cta.startFree")}</Button></Link>
          </div>
        </div>
      </section>
    </>
  );
}
