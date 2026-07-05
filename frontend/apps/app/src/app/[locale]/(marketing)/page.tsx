import { getTranslations } from "next-intl/server";
import { Button } from "@telepace/ui";
import { routes } from "@telepace/config";

import { Link } from "@/i18n/navigation";
import { HeroConversation } from "@/components/marketing/HeroConversation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.marketing.home" });
  return { title: t("title"), description: t("description") };
}

export default function Home() {
  return (
    <>
      <Hero />
      <TrustBar />
      <HowItWorks />
      <Channels />
      <AgentSurfaces />
      <UseCases />
      <FinalCTA />
    </>
  );
}

async function Hero() {
  const t = await getTranslations("marketing.home.hero");
  return (
    <section className="section-padding">
      <div className="container-content grid md:grid-cols-12 gap-10 items-center">
        <div className="md:col-span-7">
          <p className="overline mb-6">{t("eyebrow")}</p>
          <h1 className="font-display text-[clamp(2.75rem,6vw,4.75rem)] leading-[1.02]">
            {t("titleLine1")}
            <br />
            <span className="italic text-accent">{t("titleEmphasis")}</span>
          </h1>
          <p className="mt-6 text-body text-lg max-w-lg">{t("subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={routes.signup}>
              <Button size="lg">{t("ctaPrimary")}</Button>
            </Link>
            <Link href={routes.demo}>
              <Button size="lg" variant="secondary">
                {t("ctaSecondary")}
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">{t("footnote")}</p>
        </div>
        <div className="md:col-span-5">
          <HeroConversation />
        </div>
      </div>
    </section>
  );
}

async function TrustBar() {
  const t = await getTranslations("marketing.home.trustBar");
  // Verifiable product facts only — no logo wall until real customers agree
  // to be named.
  const stats = [
    { id: "channels", value: t("stats.channels.value"), detail: t("stats.channels.detail") },
    { id: "launchTime", value: t("stats.launchTime.value"), detail: t("stats.launchTime.detail") },
    { id: "surfaces", value: t("stats.surfaces.value"), detail: t("stats.surfaces.detail") },
  ];
  return (
    <section className="border-y border-hairline bg-paper-elevated">
      <div className="container-content py-10 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
        {stats.map((s) => (
          <div key={s.id}>
            <p className="font-display text-2xl">{s.value}</p>
            <p className="overline mt-1.5">{s.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

async function HowItWorks() {
  const t = await getTranslations("marketing.home.howItWorks");
  const steps = [
    {
      k: "01",
      t: t("steps.design.title"),
      d: t("steps.design.description"),
    },
    {
      k: "02",
      t: t("steps.send.title"),
      d: t("steps.send.description"),
    },
    {
      k: "03",
      t: t("steps.moderate.title"),
      d: t("steps.moderate.description"),
    },
    {
      k: "04",
      t: t("steps.insights.title"),
      d: t("steps.insights.description"),
    },
  ];
  return (
    <section className="section-padding">
      <div className="container-content">
        <p className="overline mb-4">{t("eyebrow")}</p>
        <h2 className="font-display text-4xl md:text-5xl max-w-3xl">{t("title")}</h2>
        <div className="mt-14 grid md:grid-cols-2 gap-x-14 gap-y-12">
          {steps.map((s) => (
            <div key={s.k} className="flex gap-6">
              <div className="font-display text-3xl text-accent w-12 shrink-0">{s.k}</div>
              <div>
                <h3 className="font-display text-2xl mb-2">{s.t}</h3>
                <p className="text-body max-w-md">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function Channels() {
  const t = await getTranslations("marketing.home.channels");
  const chs = [
    { id: "link", name: t("items.link.name"), meta: t("items.link.meta") },
    { id: "browserVoice", name: t("items.browserVoice.name"), meta: t("items.browserVoice.meta") },
    { id: "phone", name: t("items.phone.name"), meta: t("items.phone.meta") },
    { id: "hotline", name: t("items.hotline.name"), meta: t("items.hotline.meta") },
    { id: "email", name: t("items.email.name"), meta: t("items.email.meta") },
  ];
  return (
    <section className="section-padding border-t border-hairline bg-paper-elevated">
      <div className="container-content">
        <p className="overline mb-4">{t("eyebrow")}</p>
        <h2 className="font-display text-4xl md:text-5xl max-w-3xl">{t("title")}</h2>
        <div className="mt-14 grid md:grid-cols-5 gap-4">
          {chs.map((c) => (
            <div
              key={c.id}
              className="rounded-card border border-hairline bg-paper px-5 py-8 flex flex-col justify-between min-h-[180px]"
            >
              <p className="font-display text-xl">{c.name}</p>
              <p className="text-sm text-muted mt-4">{c.meta}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function AgentSurfaces() {
  const t = await getTranslations("marketing.home.agentSurfaces");
  return (
    <section className="section-padding">
      <div className="container-content grid md:grid-cols-12 gap-10 items-start">
        <div className="md:col-span-5">
          <p className="overline mb-4">{t("eyebrow")}</p>
          <h2 className="font-display text-4xl md:text-5xl">{t("title")}</h2>
          <p className="mt-5 text-body max-w-md">{t("description")}</p>
          <div className="mt-6 flex gap-3">
            <Link href={routes.mcp}>
              <Button variant="secondary">{t("cta")}</Button>
            </Link>
          </div>
        </div>
        <div className="md:col-span-7">
          <pre className="rounded-card border border-hairline bg-ink text-paper font-mono text-[13px] leading-relaxed p-6 overflow-x-auto whitespace-pre-wrap">
{`// Claude Code
claude> use the telepace mcp to launch a pricing study

// telepace.create_campaign
✓ campaign_id: 4f2b…9c1
✓ share_url: telepace.io/r/4f2b9c1

// 3 days later
claude> get insights for the pricing study

// telepace.get_campaign_insights
✓ 3 themes surfaced (confidence ≥ 0.7)
  · "$79 feels punitive without SSO"
  · "annual discount changes the calculus"
  · "usage-based would beat both tiers"`}
          </pre>
        </div>
      </div>
    </section>
  );
}

async function UseCases() {
  const t = await getTranslations("marketing.home.useCases");
  const cases = [
    { id: "pm", role: t("items.pm.role"), d: t("items.pm.description") },
    { id: "researchers", role: t("items.researchers.role"), d: t("items.researchers.description") },
    { id: "growth", role: t("items.growth.role"), d: t("items.growth.description") },
    { id: "founders", role: t("items.founders.role"), d: t("items.founders.description") },
  ];
  return (
    <section className="section-padding border-t border-hairline">
      <div className="container-content">
        <p className="overline mb-4">{t("eyebrow")}</p>
        <div className="mt-6 grid md:grid-cols-4 gap-6">
          {cases.map((c) => (
            <div key={c.id} className="border-t border-ink pt-6">
              <p className="font-display text-2xl">{c.role}</p>
              <p className="text-body mt-3">{c.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function FinalCTA() {
  const t = await getTranslations("marketing.home.finalCta");
  return (
    <section className="section-padding bg-ink text-paper">
      <div className="container-content text-center max-w-3xl mx-auto">
        <h2 className="font-display text-[clamp(2.5rem,5vw,4rem)]">
          {t("titleLine1")}
          <br />
          <span className="italic">{t("titleEmphasis")}</span>
        </h2>
        <p className="mt-6 text-paper/70 text-lg">{t("subtitle")}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={routes.signup}>
            <Button size="lg" variant="inverse">
              {t("ctaPrimary")}
            </Button>
          </Link>
          <Link href={routes.demo}>
            <Button size="lg" variant="inverse-outline">
              {t("ctaSecondary")}
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
