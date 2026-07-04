import Link from "next/link";
import { Button } from "@telepace/ui";
import { routes, siteConfig } from "@telepace/config";
import { Nav, Footer, PageHeader } from "@/components/site-chrome";

export const metadata = {
  title: "Docs",
  description: "Quickstarts, core concepts, and reference for building on telepace.",
};

const sections = [
  {
    title: "Quickstart",
    items: [
      { h: "In 60 seconds", body: "Create a study, share the URL, watch the first completion arrive." },
      { h: "In 15 minutes", body: "Wire the MCP server into Claude Code and let your agent do research." },
      { h: "In an hour", body: "Full production deploy — event store on Postgres, Redis, Fly.io." },
    ],
  },
  {
    title: "Core concepts",
    items: [
      { h: "Campaigns", body: "A study lifecycle: draft → published → closed. Immutable event history." },
      { h: "Interviews", body: "One respondent completing the outline. Text, voice, phone, or email." },
      { h: "Insights", body: "Themes clustered from transcripts with representative verbatims." },
      { h: "Harness", body: "Policy-gated dispatcher between commands and agents." },
    ],
  },
  {
    title: "Integrations",
    items: [
      { h: "MCP", body: "5 stateful tools. Compatible with any MCP host." },
      { h: "REST API", body: "OpenAPI schema at /openapi.json. Bearer auth." },
      { h: "Notion", body: "One-way push of insights into a database." },
      { h: "Linear", body: "Create issues per insight, grouped by theme." },
      { h: "Webhooks", body: "Any of our 20+ event types, HMAC-signed." },
    ],
  },
  {
    title: "Reference",
    items: [
      { h: "Command schemas", body: "CreateCampaign, RefineOutline, StartCampaign …" },
      { h: "Event schemas", body: "20+ append-only event types with schema_version." },
      { h: "MCP tool schemas", body: "Input/Output Pydantic pairs for every tool." },
    ],
  },
];

const codeSample = `# Install the CLI (optional)
$ pip install telepace-cli

# Or use the MCP directly in Claude Code
$ claude mcp add telepace https://mcp.telepace.io

# Create your first campaign
$ telepace campaigns create \\
    --title "Why do users abandon onboarding?" \\
    --goal "Understand the first-run friction" \\
    --channel web_text \\
    --target 25

  ✓ campaign_id: 4f2b…9c1
  ✓ share_url:  https://telepace.io/r/4f2b9c1
  ✓ next_actions:
      · dispatch invites via email
      · watch progress: telepace campaigns progress 4f2b9c1`;

export default function DocsPage() {
  return (
    <>
      <Nav />
      <PageHeader
        eyebrow="Documentation"
        title={<>Everything you need — and nothing you don't.</>}
        lede="The docs mirror the codebase's discipline: contracts first, then examples, then troubleshooting. Every command, event, and MCP tool is here."
      />

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-12 gap-10">
          <aside className="md:col-span-3">
            <nav className="sticky top-24 space-y-6 text-sm">
              {sections.map((s) => (
                <div key={s.title}>
                  <p className="overline mb-2">{s.title}</p>
                  <ul className="space-y-1.5 text-body">
                    {s.items.map((it) => (
                      <li key={it.h}>
                        <a href={`#${slug(it.h)}`} className="hover:text-ink transition-colors">{it.h}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>
          <div className="md:col-span-9 space-y-16">
            <div>
              <p className="overline mb-4">Get running in a minute</p>
              <h2 className="font-display text-3xl mb-6">The one-command install.</h2>
              <pre className="rounded-card border border-hairline bg-ink text-paper font-mono text-[13px] leading-relaxed p-6 overflow-x-auto whitespace-pre-wrap">
{codeSample}
              </pre>
            </div>

            {sections.map((s) => (
              <div key={s.title} className="space-y-6">
                <p className="overline">{s.title}</p>
                <div className="grid md:grid-cols-2 gap-4">
                  {s.items.map((it) => (
                    <div
                      key={it.h}
                      id={slug(it.h)}
                      className="rounded-card border border-hairline bg-paper-elevated p-6"
                    >
                      <p className="font-display text-xl mb-2">{it.h}</p>
                      <p className="text-body text-sm">{it.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-card border border-hairline bg-ink text-paper p-8">
              <p className="overline text-paper/70 mb-3">Still stuck?</p>
              <p className="font-display text-2xl mb-4">We answer support in hours, not days.</p>
              <div className="flex gap-3">
                <Link href={`mailto:${siteConfig.contact.supportEmail}`}><Button variant="secondary" className="border-paper/30 text-paper hover:bg-paper/10">Email support</Button></Link>
                <Link href={routes.mcp}><Button variant="secondary" className="border-paper/30 text-paper hover:bg-paper/10">Browse MCP tools</Button></Link>
              </div>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
