import Link from "next/link";
import { Button } from "@telepace/ui";
import { routes } from "@telepace/config";
import { PageHeader } from "@/components/marketing/site-chrome";

export const metadata = {
  title: "MCP",
  description:
    "The telepace MCP server: stateful research tools for any MCP-compatible agent.",
};

const tools = [
  {
    name: "create_campaign",
    description: "Draft a study from a goal + background. Returns a persistent campaign_id.",
    input: "{ title, goal, background?, target_completions?, channels? }",
    output: "{ campaign_id, outline, share_url, next_actions }",
  },
  {
    name: "get_campaign_progress",
    description: "Read the projection: completions so far, coverage per question, spend to date.",
    input: "{ campaign_id }",
    output: "{ status, completions, coverage, spend_usd, next_actions }",
  },
  {
    name: "get_campaign_insights",
    description: "Return the current cluster of themes with representative verbatims.",
    input: "{ campaign_id, min_confidence? }",
    output: "{ themes[], verbatims[], next_actions }",
  },
  {
    name: "ask_followup",
    description: "Mine the transcript corpus with a natural-language question. Non-destructive.",
    input: "{ campaign_id, question }",
    output: "{ answer, supporting_quotes, next_actions }",
  },
  {
    name: "push_insights",
    description: "Export to Notion, Linear, Slack, or a webhook. Idempotent per destination.",
    input: "{ campaign_id, destination, config }",
    output: "{ status, external_ref, next_actions }",
  },
];

const surfaces = [
  { name: "Claude Desktop", note: "Add via Settings → MCP", href: "/docs#claude-desktop" },
  { name: "Claude Code", note: "`claude mcp add telepace`", href: "/docs#claude-code" },
  { name: "Cursor", note: "cursor.json entry", href: "/docs#cursor" },
  { name: "Codex CLI", note: "Manifest link", href: "/docs#codex" },
  { name: "Custom", note: "Any MCP-compatible host", href: "/docs#custom" },
];

export default function McpPage() {
  return (
    <>
      <PageHeader
        eyebrow="Model Context Protocol"
        title={<>Your agent gets a <span className="italic text-accent">user researcher.</span></>}
        lede="telepace is a first-class MCP server. Five stateful tools your agent can call the same way a human PM would open a research tab."
      />

      <section className="section-padding">
        <div className="container-content grid gap-4 md:grid-cols-5">
          {surfaces.map((s) => (
            <Link
              key={s.name}
              href={s.href}
              className="block rounded-card border border-hairline bg-paper-elevated p-5 hover:bg-paper transition-colors"
            >
              <p className="font-display text-lg">{s.name}</p>
              <p className="text-xs text-muted mt-1 font-mono">{s.note}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content">
          <p className="overline mb-4">Tools</p>
          <h2 className="font-display text-4xl mb-10 max-w-2xl">
            Every tool returns a <span className="italic">next_actions</span> field. That's what makes tool-using agents effective.
          </h2>
          <div className="grid gap-4">
            {tools.map((t) => (
              <div key={t.name} className="rounded-card border border-hairline bg-paper p-6">
                <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 mb-3">
                  <code className="font-mono text-lg text-ink">{t.name}</code>
                  <span className="text-xs text-muted">MCP tool</span>
                </div>
                <p className="text-body mb-4">{t.description}</p>
                <div className="grid md:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="rounded-btn bg-paper-sunken p-3">
                    <p className="overline mb-2 text-muted">Input</p>
                    <code className="text-body whitespace-pre-wrap">{t.input}</code>
                  </div>
                  <div className="rounded-btn bg-paper-sunken p-3">
                    <p className="overline mb-2 text-muted">Output</p>
                    <code className="text-body whitespace-pre-wrap">{t.output}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-2 gap-10">
          <div>
            <p className="overline mb-3">Try it in 60 seconds</p>
            <h2 className="font-display text-3xl mb-4">Wire telepace into Claude Code.</h2>
            <p className="text-body mb-6">
              One command, no config. Your Claude gains an entire research team.
            </p>
            <Link href={routes.docs}><Button>Read the docs →</Button></Link>
          </div>
          <pre className="rounded-card border border-hairline bg-ink text-paper font-mono text-[13px] p-6 overflow-x-auto whitespace-pre-wrap">
{`# 1. Add the MCP server
$ claude mcp add telepace https://mcp.telepace.io

# 2. Ask Claude to do research
claude> Run a study on why users churn from our pro tier.

  · Calling telepace.create_campaign …
    ↳ campaign_id: 4f2b…9c1
    ↳ share_url:  https://telepace.io/r/4f2b9c1

  · Calling telepace.get_campaign_progress …
    ↳ 32 / 50 completions · coverage 78%

  · Calling telepace.get_campaign_insights …
    ↳ 3 themes surfaced (confidence ≥ 0.7)

Ready to push? Reply "push to Notion" and I'll finalize.`}
          </pre>
        </div>
      </section>
    </>
  );
}
