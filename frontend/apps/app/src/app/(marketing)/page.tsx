import Link from "next/link";
import { Button } from "@telepace/ui";
import { routes } from "@telepace/config";
import { Nav, Footer } from "@/components/marketing/site-chrome";
import { HeroConversation } from "@/components/marketing/HeroConversation";

export default function Home() {
  return (
    <>
      <Nav />
      <Hero />
      <TrustBar />
      <HowItWorks />
      <Channels />
      <AgentSurfaces />
      <UseCases />
      <FinalCTA />
      <Footer />
    </>
  );
}

function Hero() {
  return (
    <section className="section-padding">
      <div className="container-content grid md:grid-cols-12 gap-10 items-center">
        <div className="md:col-span-7">
          <p className="overline mb-6">Voice-native, agent-first</p>
          <h1 className="font-display text-[clamp(2.75rem,6vw,4.75rem)] leading-[1.02]">
            Understand what people
            <br />
            <span className="italic text-accent">actually want</span>, and why.
          </h1>
          <p className="mt-6 text-body text-lg max-w-lg">
            telepace runs voice interviews with your users on autopilot — and hands
            the structured insights back to your agent, so it can act on them.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={routes.signup}>
              <Button size="lg">Start free</Button>
            </Link>
            <Link href={routes.demo}>
              <Button size="lg" variant="secondary">
                Try a live 60-sec interview →
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">
            Free tier includes 3 studies / month. No credit card.
          </p>
        </div>
        <div className="md:col-span-5">
          <HeroConversation />
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  const stats = [
    "5 channels · one interview",
    "< 60s to launch a study",
    "MCP · Skill · REST",
  ];
  return (
    <section className="border-y border-hairline bg-paper-elevated">
      <div className="container-content py-10 flex flex-wrap items-center gap-x-12 gap-y-3 justify-center text-center">
        {stats.map((s) => (
          <span key={s} className="font-display text-lg text-ink-soft">
            {s}
          </span>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      k: "01",
      t: "Design in chat",
      d: "Describe what you want to learn. Our Designer agent proposes an outline in seconds — you refine it in conversation.",
    },
    {
      k: "02",
      t: "Send by voice, phone, or link",
      d: "Push to email, drop a share URL, or place outbound calls. Same interview, five channels.",
    },
    {
      k: "03",
      t: "AI moderates the interview",
      d: "Every session gets the same careful researcher: warm probing, coverage tracking, escalation when it matters.",
    },
    {
      k: "04",
      t: "Insights, ready to act",
      d: "Themes, verbatims, personas — piped back into your agent, Notion, or Linear. No dashboard-scrolling required.",
    },
  ];
  return (
    <section className="section-padding">
      <div className="container-content">
        <p className="overline mb-4">How it works</p>
        <h2 className="font-display text-4xl md:text-5xl max-w-3xl">
          From idea to insight in a single conversation.
        </h2>
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

function Channels() {
  const chs = [
    { name: "Shareable link", meta: "seconds to launch" },
    { name: "Browser voice", meta: "real-time · low latency" },
    { name: "Outbound phone call", meta: "Vapi + human warmth" },
    { name: "Inbound hotline", meta: "your own number" },
    { name: "Email invite", meta: "async · batch friendly" },
  ];
  return (
    <section className="section-padding border-t border-hairline bg-paper-elevated">
      <div className="container-content">
        <p className="overline mb-4">Five channels, one interview</p>
        <h2 className="font-display text-4xl md:text-5xl max-w-3xl">
          Meet respondents where they already are.
        </h2>
        <div className="mt-14 grid md:grid-cols-5 gap-4">
          {chs.map((c) => (
            <div
              key={c.name}
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

function AgentSurfaces() {
  return (
    <section className="section-padding">
      <div className="container-content grid md:grid-cols-12 gap-10 items-start">
        <div className="md:col-span-5">
          <p className="overline mb-4">Agent-first</p>
          <h2 className="font-display text-4xl md:text-5xl">
            Your agent gets a user researcher.
          </h2>
          <p className="mt-5 text-body max-w-md">
            telepace ships as an MCP server, a Skill, and a REST API. Wherever your
            agents live — Claude Desktop, Cursor, Codex, a custom orchestrator — they
            can now design studies, dispatch interviews, and read back structured
            insights.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href={routes.mcp}>
              <Button variant="secondary">Browse MCP tools →</Button>
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

function UseCases() {
  const cases = [
    { role: "Product Managers", d: "Get customer voice into every roadmap review." },
    { role: "UX Researchers", d: "Scale 1:1 depth without hiring an army." },
    { role: "Growth", d: "Interview churned users before they forget why they left." },
    { role: "Founders", d: "Run 30 interviews the week you're building the MVP." },
  ];
  return (
    <section className="section-padding border-t border-hairline bg-paper-elevated">
      <div className="container-content">
        <p className="overline mb-4">Made for</p>
        <div className="mt-6 grid md:grid-cols-4 gap-6">
          {cases.map((c) => (
            <div key={c.role} className="border-t border-ink pt-6">
              <p className="font-display text-2xl">{c.role}</p>
              <p className="text-body mt-3">{c.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="section-padding bg-ink text-paper">
      <div className="container-content text-center max-w-3xl mx-auto">
        <h2 className="font-display text-[clamp(2.5rem,5vw,4rem)]">
          Stop guessing.
          <br />
          <span className="italic">Start listening.</span>
        </h2>
        <p className="mt-6 text-paper/70 text-lg">
          Every product decision deserves a hundred users behind it.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={routes.signup}>
            <Button size="lg" variant="inverse">
              Start free
            </Button>
          </Link>
          <Link href={routes.demo}>
            <Button size="lg" variant="inverse-outline">
              Try a live 60-sec interview →
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

