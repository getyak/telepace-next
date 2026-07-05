import { getTranslations } from "next-intl/server";
import { Button } from "@telepace/ui";
import { routes } from "@telepace/config";

import { PageHeader } from "@/components/marketing/site-chrome";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.marketing.productVoice" });
  return { title: t("title"), description: t("description") };
}

const SPEC_IDS = ["latency", "turnTaking", "language", "pii", "consent"] as const;
const CHANNEL_IDS = ["browser", "phone", "hotline"] as const;

export default async function VoicePage() {
  const t = await getTranslations("marketing.productVoice");

  const specs = SPEC_IDS.map((id) => ({
    k: t(`specs.${id}.k`),
    v: t(`specs.${id}.v`),
    note: t(`specs.${id}.note`),
  }));

  const channels = CHANNEL_IDS.map((id) => ({
    name: t(`channels.${id}.name`),
    tag: t(`channels.${id}.tag`),
    body: t(`channels.${id}.body`),
  }));

  return (
    <>
      <PageHeader
        eyebrow={t("hero.eyebrow")}
        title={<>{t("hero.titlePrefix")} <span className="italic text-accent">{t("hero.titleHighlight")}</span></>}
        lede={t("hero.lede")}
      />

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-12 gap-10 items-start">
          <div className="md:col-span-7">
            <p className="overline mb-4">{t("whyVoice.eyebrow")}</p>
            <h2 className="font-display text-4xl mb-6 leading-tight">
              {t("whyVoice.title")}
            </h2>
            <div className="space-y-5 text-body">
              <p>
                {t("whyVoice.paragraph1")}
              </p>
              <p>
                {t("whyVoice.paragraph2")}
              </p>
              <p>
                {t("whyVoice.paragraph3")}
              </p>
            </div>
          </div>
          <aside className="md:col-span-5">
            <div className="rounded-card border border-hairline bg-paper-elevated overflow-hidden">
              <div className="border-b border-hairline px-5 py-3 text-xs text-muted font-mono">
                voiceflow · production-grade Go audio pipeline
              </div>
              <div className="p-5 space-y-2 text-sm font-mono">
                <p><span className="text-muted">◦</span> mic ─▶ VAD ─▶ STT stream</p>
                <p><span className="text-muted">◦</span>            ╰▶ Interviewer</p>
                <p><span className="text-muted">◦</span>                       ↓</p>
                <p><span className="text-muted">◦</span>                     LLM turn</p>
                <p><span className="text-muted">◦</span>                       ↓</p>
                <p><span className="text-muted">◦</span> speaker ◀─ TTS stream ◀╯</p>
              </div>
            </div>
            <dl className="mt-6 space-y-2 text-sm">
              {specs.map((s) => (
                <div key={s.k} className="flex justify-between border-b border-hairline py-2">
                  <dt className="text-muted">{s.k}</dt>
                  <dd className="text-body text-right">
                    {s.v}
                    <span className="block text-xs text-muted">{s.note}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content">
          <p className="overline mb-4">{t("channelsSection.eyebrow")}</p>
          <h2 className="font-display text-4xl mb-12 max-w-2xl">
            {t("channelsSection.title")}
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {channels.map((c) => (
              <div key={c.name} className="rounded-card border border-hairline bg-paper p-6">
                <p className="overline mb-3">{c.tag}</p>
                <p className="font-display text-2xl mb-3">{c.name}</p>
                <p className="text-body text-sm">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding text-center">
        <div className="container-content max-w-2xl">
          <h2 className="font-display text-4xl md:text-5xl">{t("cta.title")}</h2>
          <p className="mt-4 text-body">{t("cta.lede")}</p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href={routes.demo}><Button size="lg">{t("cta.tryDemo")}</Button></Link>
            <Link href={routes.pricing}><Button size="lg" variant="secondary">{t("cta.seePricing")}</Button></Link>
          </div>
        </div>
      </section>
    </>
  );
}
