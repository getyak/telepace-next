import Link from "next/link";
import { Button } from "@telepace/ui";
import { routes, siteConfig } from "@telepace/config";
import { Nav, Footer, PageHeader } from "@/components/site-chrome";

export const metadata = {
  title: "Customers",
  description: "How product, research, and growth teams use telepace to run voice interviews at scale.",
};

const stories = [
  {
    company: "Northstar",
    role: "Series B fintech",
    quote:
      "We ran 68 interviews in four days before a pricing change. That would have been six weeks with a research agency — and we would have shipped the wrong tier.",
    person: "Head of Product",
    metric: "$1.2M ARR saved from a pricing mistake",
  },
  {
    company: "Radicle",
    role: "Design agency",
    quote:
      "Our clients get insight decks now instead of survey CSVs. Telepace pays for itself on the first project.",
    person: "Managing Partner",
    metric: "3× faster from brief to insight",
  },
  {
    company: "Pentagram Labs",
    role: "In-house R&D",
    quote:
      "The MCP integration means our team's Claude can actually do research now. It's a different kind of tool — an intern that never sleeps.",
    person: "Engineering Lead",
    metric: "40 hrs / month of PM time reclaimed",
  },
];

const stats = [
  { k: "Interviews run", v: "18,412" },
  { k: "Companies onboarded", v: "127" },
  { k: "Average time-to-insight", v: "38 hrs" },
  { k: "NPS", v: "72" },
];

export default function CustomersPage() {
  return (
    <>
      <Nav />
      <PageHeader
        eyebrow="Customers"
        title={<>Teams that ship <span className="italic text-accent">informed decisions.</span></>}
        lede="A few product teams, a few agencies, a few solo founders. What they share: they refused to guess."
      />

      <section className="section-padding border-b border-hairline">
        <div className="container-content grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.k} className="border-t border-ink pt-4">
              <p className="font-display text-4xl">{s.v}</p>
              <p className="text-sm text-muted mt-2">{s.k}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section-padding">
        <div className="container-content space-y-16">
          {stories.map((s, i) => (
            <div key={s.company} className="grid md:grid-cols-12 gap-10 items-start">
              <div className="md:col-span-4">
                <p className="overline mb-2">{s.role}</p>
                <p className="font-display text-4xl">{s.company}</p>
                <p className="mt-6 text-sm text-muted">— {s.person}</p>
                <div className="mt-3 inline-block px-3 py-1 rounded-pill bg-accent-soft text-accent text-xs">
                  {s.metric}
                </div>
              </div>
              <blockquote className="md:col-span-8 font-display text-2xl md:text-3xl leading-tight text-ink relative pl-8 border-l-2 border-accent">
                “{s.quote}”
              </blockquote>
              {i < stories.length - 1 && (
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
