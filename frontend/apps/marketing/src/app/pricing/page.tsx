import Link from "next/link";
import { Button } from "@telepace/ui";
import { routes, siteConfig } from "@telepace/config";
import { Nav, Footer, PageHeader } from "@/components/site-chrome";

export const metadata = {
  title: "Pricing",
  description: "Simple, usage-based pricing for voice-native user research — start free, scale as you grow.",
};

const tiers = [
  {
    name: "Free",
    price: "$0",
    cadence: "/month",
    tagline: "For your first three interviews.",
    cta: { label: "Start free", href: routes.signup },
    features: [
      "3 studies / month",
      "10 completions per study",
      "Text + shareable link channels",
      "Community support",
      "Telepace watermark",
    ],
  },
  {
    name: "Pro",
    price: "$79",
    cadence: "/month",
    tagline: "For product teams shipping weekly.",
    cta: { label: "Start Pro trial", href: `${routes.signup}?plan=pro` },
    highlight: true,
    features: [
      "Unlimited studies",
      "500 completions / month",
      "Voice + phone + email channels",
      "MCP + REST API",
      "Notion & Linear integrations",
      "Priority support",
    ],
  },
  {
    name: "Team",
    price: "$249",
    cadence: "/month",
    tagline: "For research org-charts.",
    cta: { label: "Talk to us", href: `mailto:${siteConfig.contact.helloEmail}` },
    features: [
      "Everything in Pro",
      "5 seats · SSO",
      "2,500 completions / month",
      "Shared insight library",
      "Custom Skill packaging",
      "SLA + Slack channel",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    tagline: "VPC deploy, SOC 2, procurement-friendly.",
    cta: { label: "Contact sales", href: `mailto:${siteConfig.contact.salesEmail}` },
    features: [
      "Self-hosted VPC option",
      "SOC 2 Type II & DPA",
      "Fine-tuned Interviewer",
      "Dedicated CSM",
      "Custom retention & residency",
      "Volume pricing",
    ],
  },
];

const faq = [
  {
    q: "How is a completion defined?",
    a: "One respondent finishing the interview end-to-end. Abandons and duplicates don't count.",
  },
  {
    q: "Can I bring my own LLM key?",
    a: "Yes. Pro and above support BYO Anthropic, OpenAI, and Azure keys — no markup.",
  },
  {
    q: "Do you charge for phone minutes?",
    a: "Voice minutes on the Pro plan pass through at cost (~$0.09/min). Team gets bundled minutes.",
  },
  {
    q: "How do I cancel?",
    a: "One click. We prorate to the day and email you a CSV export of every insight.",
  },
  {
    q: "Is my raw data used to train models?",
    a: "Never. Transcripts stay in your workspace. See our Security page for the full attestation.",
  },
];

export default function PricingPage() {
  return (
    <>
      <Nav />
      <PageHeader
        eyebrow="Pricing"
        title={<>Fair pricing. <span className="italic text-accent">Real research.</span></>}
        lede="Start free. Upgrade when a decision depends on it. Cancel with a click. Every tier includes the full Interviewer agent — we don't paywall quality."
      />

      <section className="section-padding">
        <div className="container-content grid gap-6 md:grid-cols-4">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={
                "flex flex-col rounded-card border p-8 " +
                (t.highlight
                  ? "border-ink bg-ink text-paper"
                  : "border-hairline bg-paper-elevated")
              }
            >
              <p className={"overline " + (t.highlight ? "text-paper/70" : "")}>{t.name}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-5xl">{t.price}</span>
                <span className={t.highlight ? "text-paper/60 text-sm" : "text-muted text-sm"}>
                  {t.cadence}
                </span>
              </div>
              <p className={"mt-3 text-sm " + (t.highlight ? "text-paper/80" : "text-body")}>
                {t.tagline}
              </p>
              <ul className="mt-8 space-y-3 text-sm flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <span className={t.highlight ? "text-accent-soft" : "text-accent"}>✓</span>
                    <span className={t.highlight ? "text-paper/90" : "text-body"}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href={t.cta.href} className="mt-8">
                <Button
                  className="w-full"
                  variant={t.highlight ? "inverse" : "secondary"}
                >
                  {t.cta.label}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content max-w-3xl">
          <p className="overline mb-4">Frequently asked</p>
          <h2 className="font-display text-4xl mb-10">Answers before you ask.</h2>
          <dl className="divide-y divide-hairline border-t border-b border-hairline">
            {faq.map((item) => (
              <div key={item.q} className="py-6">
                <dt className="font-display text-xl mb-2">{item.q}</dt>
                <dd className="text-body">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section-padding text-center">
        <div className="container-content max-w-2xl">
          <h2 className="font-display text-4xl md:text-5xl">Try before you decide.</h2>
          <p className="mt-4 text-body">
            The free tier is enough to run your first real study. No card required.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href={routes.signup}><Button size="lg">Start free</Button></Link>
            <Link href={routes.demo}><Button size="lg" variant="secondary">See a 60s demo →</Button></Link>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
