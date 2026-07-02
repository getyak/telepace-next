import Link from "next/link";
import { Button } from "@telepace/ui";
import { Nav, Footer, PageHeader } from "@/components/site-chrome";

export const metadata = { title: "Agent · telepace" };

const agents = [
  {
    name: "Designer",
    role: "Chats with you to turn a goal into an interview outline.",
    inputs: "goal · background · constraints",
    outputs: "SpecUpdated event stream",
  },
  {
    name: "Interviewer",
    role: "Runs the live conversation. Probes. Tracks coverage. Knows when to stop.",
    inputs: "outline + running transcript",
    outputs: "TurnRecorded · InterviewCompleted",
  },
  {
    name: "Analyst",
    role: "Embeds transcripts, clusters themes, drafts insight reports.",
    inputs: "InterviewCompleted stream",
    outputs: "TranscriptEmbedded · ThemeClusterUpdated · InsightGenerated",
  },
  {
    name: "Coordinator",
    role: "Watches the campaign as a whole. Nudges, escalates, closes.",
    inputs: "every projection",
    outputs: "NotificationSent · EscalationTriggered",
  },
];

const policies = [
  { k: "Budget", v: "Per-campaign USD ceilings on LLM + voice minutes." },
  { k: "PII", v: "Presidio + custom patterns. Redact before persistence." },
  { k: "Escalation", v: "Distress / self-harm signals stop the run and page a human." },
  { k: "Observability", v: "Every agent call has trace_id, cost, and eval score attached." },
];

export default function AgentPage() {
  return (
    <>
      <Nav />
      <PageHeader
        eyebrow="Product · Agent"
        title={<>Four agents, <span className="italic text-accent">one accountable system.</span></>}
        lede="telepace isn't 'a chatbot doing surveys.' It's a harness of specialized agents, an event-sourced spine, and policy layers that keep them honest — designed to be inspected, replayed, and improved."
      />

      <section className="section-padding">
        <div className="container-content">
          <p className="overline mb-4">The team</p>
          <h2 className="font-display text-4xl mb-12 max-w-2xl">
            Each agent has one job. That's why the system stays reliable.
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {agents.map((a) => (
              <div key={a.name} className="rounded-card border border-hairline bg-paper-elevated p-6">
                <p className="font-display text-2xl mb-3">{a.name}</p>
                <p className="text-body text-sm mb-5">{a.role}</p>
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="rounded-btn bg-paper-sunken p-3">
                    <p className="overline mb-1 text-muted">Consumes</p>
                    <p className="text-body">{a.inputs}</p>
                  </div>
                  <div className="rounded-btn bg-paper-sunken p-3">
                    <p className="overline mb-1 text-muted">Emits</p>
                    <p className="text-body">{a.outputs}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content grid md:grid-cols-12 gap-10">
          <div className="md:col-span-6">
            <p className="overline mb-4">The harness</p>
            <h2 className="font-display text-4xl mb-6">Not just LLMs in a trenchcoat.</h2>
            <div className="space-y-4 text-body">
              <p>
                Every command routes through the <span className="font-mono">Harness</span>: a
                policy-gated dispatcher backed by an append-only event store. Nothing gets to an
                agent until the budget check, the PII check, and the escalation check say yes.
              </p>
              <p>
                Because state is events, we can replay any campaign, A/B a policy against a corpus,
                or reconstruct exactly what the Interviewer heard on turn 27 of interview 84.
              </p>
              <p>
                It's the engineering discipline your compliance team asks about — built in from day one.
              </p>
            </div>
            <div className="mt-6"><Link href="/docs"><Button variant="secondary">Read the architecture docs →</Button></Link></div>
          </div>
          <div className="md:col-span-6">
            <div className="rounded-card border border-hairline bg-paper p-6">
              <p className="overline mb-4">Policies enforced by default</p>
              <dl className="divide-y divide-hairline">
                {policies.map((p) => (
                  <div key={p.k} className="py-4 flex gap-6">
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
          <h2 className="font-display text-4xl md:text-5xl">Bring your own agent host.</h2>
          <p className="mt-4 text-body">
            telepace ships as an MCP server + REST + Skill. Wherever your agents live, they get a research team.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/mcp"><Button size="lg">Browse MCP tools →</Button></Link>
            <Link href="/signup"><Button size="lg" variant="secondary">Start free</Button></Link>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
