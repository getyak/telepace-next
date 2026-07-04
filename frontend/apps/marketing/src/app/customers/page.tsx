import Link from "next/link";
import { Button } from "@telepace/ui";
import { routes, siteConfig } from "@telepace/config";
import { Nav, Footer, PageHeader } from "@/components/site-chrome";

export const metadata = {
  title: "Customers",
  description: "How product, research, and growth teams use telepace to run voice interviews at scale.",
};

// Illustrative scenarios, not attributed testimonials — telepace is in early
// access and doesn't have named customer logos or quotes to publish yet.
const scenarios = [
  {
    role: "Series B fintech",
    title: "A pricing decision, days not weeks",
    body: "Run dozens of voice interviews before a pricing change ships, instead of waiting on a research agency's six-week turnaround.",
    metric: "Interviews in days, not weeks",
  },
  {
    role: "Design agency",
    title: "Insight decks, not survey CSVs",
    body: "Hand clients a synthesized set of findings instead of raw spreadsheet exports — the interview and the analysis happen in one pass.",
    metric: "One pass from brief to insight",
  },
  {
    role: "In-house R&D",
    title: "Research your agents can use",
    body: "The MCP integration means an agent can commission and read back a study directly — research becomes something tooling can call, not just a PDF.",
    metric: "MCP · Skill · REST",
  },
];

const capabilities = [
  { k: "Interview channels", v: "5" },
  { k: "Time to launch a study", v: "< 60s" },
  { k: "Integration surfaces", v: "MCP · Skill · REST" },
  { k: "Interview format", v: "Voice-native" },
];

export default function CustomersPage() {
  return (
    <>
      <Nav />
      <PageHeader
        eyebrow="Customers"
        title={<>Built for teams that ship <span className="italic text-accent">informed decisions.</span></>}
        lede="telepace is in early access — here's how product teams, agencies, and founders are using it, in their own words once we can share them."
      />

      <section className="section-padding border-b border-hairline">
        <div className="container-content grid grid-cols-2 md:grid-cols-4 gap-6">
          {capabilities.map((s) => (
            <div key={s.k} className="border-t border-ink pt-4">
              <p className="font-display text-4xl">{s.v}</p>
              <p className="text-sm text-muted mt-2">{s.k}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section-padding">
        <div className="container-content space-y-16">
          {scenarios.map((s, i) => (
            <div key={s.title} className="grid md:grid-cols-12 gap-10 items-start">
              <div className="md:col-span-4">
                <p className="overline mb-2">{s.role}</p>
                <p className="font-display text-3xl leading-tight">{s.title}</p>
                <div className="mt-4 inline-block px-3 py-1 rounded-pill bg-accent-soft text-accent text-xs">
                  {s.metric}
                </div>
              </div>
              <p className="md:col-span-8 font-display text-2xl md:text-3xl leading-tight text-ink relative pl-8 border-l-2 border-accent">
                {s.body}
              </p>
              {i < scenarios.length - 1 && (
                <div className="md:col-span-12 border-b border-hairline mt-4" />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding text-center">
        <div className="container-content max-w-2xl">
          <h2 className="font-display text-4xl md:text-5xl">Ready to write yours?</h2>
          <p className="mt-4 text-body">If you ship a decision this month, we'd like it to be an informed one.</p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href={routes.signup}><Button size="lg">Start free</Button></Link>
            <Link href={`mailto:${siteConfig.contact.helloEmail}`}><Button size="lg" variant="secondary">Talk to a founder →</Button></Link>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
