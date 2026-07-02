import Link from "next/link";
import { Button } from "@telepace/ui";

type Params = { id: string };

const outline = [
  { order: 1, question: "Tell me about your role and what you're working on this quarter.", goal: "context" },
  { order: 2, question: "Walk me through the last time you needed to price-check a subscription tier.", goal: "current behavior" },
  { order: 3, question: "What made you pause on the $79 tier specifically?", goal: "friction" },
  { order: 4, question: "If SSO were included, would that change your decision?", goal: "willingness to pay" },
  { order: 5, question: "What have you tried that didn't work for team accounts?", goal: "prior attempts" },
];

const completions = [
  { id: "int-041", channel: "web_voice", duration: "13m 22s", status: "complete", started: "2026-07-02 09:12" },
  { id: "int-040", channel: "web_text",  duration: "18m 04s", status: "complete", started: "2026-07-02 08:41" },
  { id: "int-039", channel: "phone",     duration: "11m 55s", status: "complete", started: "2026-07-01 22:03" },
  { id: "int-038", channel: "web_text",  duration:  "6m 40s", status: "abandoned",started: "2026-07-01 18:19" },
  { id: "int-037", channel: "web_voice", duration: "15m 11s", status: "complete", started: "2026-07-01 16:45" },
];

const channelStyle: Record<string, string> = {
  web_voice: "bg-accent-soft text-accent border-accent/30",
  web_text: "bg-paper-sunken text-body border-hairline",
  phone: "bg-terracotta/10 text-terracotta border-terracotta/20",
};

export default async function StudyPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;

  return (
    <div className="p-10 max-w-content mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-sm text-muted hover:text-ink transition-colors">← All studies</Link>
      </div>

      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
        <div>
          <p className="overline mb-2">Study #{id}</p>
          <h1 className="font-display text-4xl">Pricing sensitivity for pro tier</h1>
          <p className="text-body mt-3 max-w-2xl">
            Why are Pro-tier trialists dropping off before card entry? Focused on the $79 tier and adjacent SSO ask.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">Share URL</Button>
          <Button variant="secondary" size="sm">Push insights →</Button>
          <Button size="sm">Close study</Button>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-14">
        <Metric label="Completions" value="32 / 50" />
        <Metric label="Coverage" value="78%" tone="accent" />
        <Metric label="Median length" value="13m 21s" />
        <Metric label="Spend" value="$14.20" />
      </section>

      <section className="grid md:grid-cols-12 gap-10 mb-14">
        <div className="md:col-span-7">
          <p className="overline mb-4">Outline</p>
          <ol className="space-y-3">
            {outline.map((q) => (
              <li key={q.order} className="rounded-card border border-hairline bg-paper-elevated p-4">
                <div className="flex gap-4">
                  <div className="font-mono text-sm text-muted w-6 pt-0.5">
                    {String(q.order).padStart(2, "0")}
                  </div>
                  <div className="flex-1">
                    <p className="text-ink">{q.question}</p>
                    <p className="text-xs text-muted mt-1">Goal: {q.goal}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <aside className="md:col-span-5 space-y-6">
          <div className="rounded-card border border-hairline bg-paper-elevated p-6">
            <p className="overline mb-3">Channels</p>
            <ul className="text-sm text-body space-y-2">
              <li>· <span className="text-ink">Web text</span> — link, always on</li>
              <li>· <span className="text-ink">Web voice</span> — browser mic</li>
              <li>· <span className="text-ink">Outbound phone</span> — Vapi · 12 dialled</li>
              <li className="text-muted">· Email — disabled</li>
            </ul>
          </div>
          <div className="rounded-card border border-hairline bg-paper-elevated p-6">
            <p className="overline mb-3">Policies</p>
            <ul className="text-sm text-body space-y-2">
              <li>· Budget cap $20 · <span className="text-accent">$14.20 spent</span></li>
              <li>· PII redactor · active</li>
              <li>· Escalation policy · active · 1 triggered</li>
            </ul>
          </div>
        </aside>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <p className="overline">Latest completions</p>
          <Link href="#" className="text-sm text-accent">See all →</Link>
        </div>
        <div className="border border-hairline rounded-card divide-y divide-hairline bg-paper-elevated">
          {completions.map((c) => (
            <div key={c.id} className="grid grid-cols-12 items-center px-6 py-4 text-sm">
              <div className="col-span-3 font-mono text-body">{c.id}</div>
              <div className="col-span-2">
                <span className={`inline-block px-2.5 py-0.5 rounded-pill border text-xs ${channelStyle[c.channel]}`}>
                  {c.channel}
                </span>
              </div>
              <div className="col-span-2 text-body">{c.duration}</div>
              <div className="col-span-3 font-mono text-muted">{c.started}</div>
              <div className="col-span-2 text-right">
                <span className={c.status === "complete" ? "text-accent" : "text-muted"}>{c.status}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "accent" }) {
  return (
    <div className="rounded-card border border-hairline bg-paper-elevated p-5">
      <p className="overline mb-2">{label}</p>
      <p className={`font-display text-3xl ${tone === "accent" ? "text-accent" : "text-ink"}`}>{value}</p>
    </div>
  );
}
