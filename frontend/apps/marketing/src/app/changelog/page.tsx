import Link from "next/link";
import { siteConfig } from "@telepace/config";
import { Nav, Footer, PageHeader } from "@/components/site-chrome";

export const metadata = { title: "Changelog · telepace" };

const entries = [
  {
    date: "2026-06-28",
    tag: "release",
    title: "MCP v1.2 · ask_followup ships",
    body: "Your agents can now mine any transcript corpus with a natural-language question. Non-destructive, includes supporting quotes, and returns a next_actions hint every time.",
    items: [
      "New tool: telepace.ask_followup",
      "Return signature includes supporting_quotes[]",
      "Rate limit: 60 req/min per campaign on Pro; 300/min on Team",
    ],
  },
  {
    date: "2026-06-14",
    tag: "release",
    title: "Voice interviews leave beta",
    body: "Browser voice + outbound phone now general availability. New endpoint metric round trip median dropped from 620ms to 380ms.",
    items: [
      "Sub-400ms turn-taking on all supported regions",
      "10 languages: EN · ES · FR · DE · JA · ZH · PT · IT · KO · RU",
      "Phone calls: pass-through pricing (~$0.09/min)",
    ],
  },
  {
    date: "2026-06-02",
    tag: "improvement",
    title: "Coverage tracker rewrite",
    body: "The Interviewer now knows what's still open with 3× the precision. Fewer redundant probes, faster wrap-ups, better completion rates.",
    items: [
      "Median interview length: 14min → 11min",
      "Completion rate: 71% → 84%",
    ],
  },
  {
    date: "2026-05-20",
    tag: "release",
    title: "Notion + Linear integrations",
    body: "One-click push of insights straight into your existing tools. Idempotent, HMAC-signed, resumable.",
    items: [
      "Notion database sync",
      "Linear issue-per-theme with owner assignment",
    ],
  },
  {
    date: "2026-05-05",
    tag: "release",
    title: "Telepace 1.0 · public launch",
    body: "After eight months of private beta, we're open. Voice-native, agent-first user research infrastructure.",
    items: [
      "Free tier: 3 studies / month",
      "MCP server v1.0",
      "SOC 2 Type II audit begins",
    ],
  },
];

const tagStyles: Record<string, string> = {
  release: "bg-accent-soft text-accent border-accent/30",
  improvement: "bg-paper-sunken text-body border-hairline",
  fix: "bg-paper text-muted border-hairline",
};

export default function ChangelogPage() {
  return (
    <>
      <Nav />
      <PageHeader
        eyebrow="Changelog"
        title={<>Every ship, every week.</>}
        lede="Small teams building for small teams. We ship on Wednesdays and share what changed."
      />

      <section className="section-padding">
        <div className="container-content max-w-3xl space-y-14">
          {entries.map((e) => (
            <article key={e.date + e.title} className="grid md:grid-cols-12 gap-6 items-start">
              <div className="md:col-span-3 text-sm text-muted font-mono">{e.date}</div>
              <div className="md:col-span-9">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`inline-block px-2.5 py-0.5 rounded-pill border text-xs ${tagStyles[e.tag]}`}>
                    {e.tag}
                  </span>
                </div>
                <h2 className="font-display text-2xl mb-3">{e.title}</h2>
                <p className="text-body mb-4">{e.body}</p>
                <ul className="text-sm text-body space-y-1">
                  {e.items.map((it) => (
                    <li key={it}>· {it}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content max-w-2xl text-center">
          <p className="overline mb-3">Feature requests</p>
          <h2 className="font-display text-3xl mb-4">Want something we don't have yet?</h2>
          <p className="text-body">
            Email <Link href={`mailto:${siteConfig.contact.featureRequestEmail}`} className="text-accent underline">{siteConfig.contact.featureRequestEmail}</Link> — a founder reads every one.
          </p>
        </div>
      </section>
      <Footer />
    </>
  );
}
