import Link from "next/link";
import { Button } from "@telepace/ui";
import { siteConfig } from "@telepace/config";
import { Nav, Footer, PageHeader } from "@/components/site-chrome";

export const metadata = { title: "Careers · telepace" };

const roles = [
  {
    title: "Founding voice ML engineer",
    location: "Remote · UTC ± 6",
    type: "Full-time",
    summary:
      "Own the voice pipeline end to end: STT streaming, VAD, endpointing, TTS, phone integration. Ship in weeks, iterate in hours.",
    stack: "Go · Python · gRPC · WebRTC",
  },
  {
    title: "Founding designer",
    location: "Remote · Any timezone",
    type: "Full-time",
    summary:
      "Set the visual and interaction language for the whole product. You've shipped work that felt inevitable in retrospect.",
    stack: "Figma · Next.js · Tailwind · React",
  },
  {
    title: "Applied research engineer (LLM)",
    location: "SF · NYC · Remote",
    type: "Full-time",
    summary:
      "Fine-tune, eval, and deploy the Interviewer. You care about calibration, refusal behavior, and reproducibility more than benchmarks.",
    stack: "Python · Anthropic API · pgvector · vLLM",
  },
  {
    title: "GTM · founding sales",
    location: "SF preferred",
    type: "Full-time",
    summary:
      "First non-technical hire. Own the pipeline from cold outbound to closed-won. Sell to PMs and researchers you'd want to be friends with.",
    stack: "You've done this at a Series A before.",
  },
];

const principles = [
  { k: "Craft > scale", v: "We'd rather have 200 users who love us than 20,000 who forget us." },
  { k: "Direct over polite", v: "Kind. Direct. Specific. Nothing rots faster than unspoken feedback." },
  { k: "Own the outcome", v: "Titles are shorthand. You own what you touch until it works." },
  { k: "Sleep matters", v: "No hero-mode after 8pm. If it's on fire on Sunday, that's a design flaw." },
];

export default function CareersPage() {
  return (
    <>
      <Nav />
      <PageHeader
        eyebrow="Careers"
        title={<>Build the research team <span className="italic text-accent">every builder deserves.</span></>}
        lede="We're early: five people, ten thousand users, one massive market. If your best work is still ahead of you, so is ours."
      />

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-2 gap-10">
          <div>
            <p className="overline mb-4">How we work</p>
            <h2 className="font-display text-3xl mb-6">Four things we won't compromise on.</h2>
            <dl className="space-y-6">
              {principles.map((p) => (
                <div key={p.k}>
                  <dt className="font-display text-lg mb-1">{p.k}</dt>
                  <dd className="text-body">{p.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <p className="overline mb-4">The offer</p>
            <div className="space-y-4 text-body">
              <p>Salary at the 75th percentile of Series A, with meaningful equity — not the 0.05% kind.</p>
              <p>Full health / dental / vision. $2,000 home-office budget. Two offsites a year.</p>
              <p>Remote-first, async by default, four hours of live overlap.</p>
              <p>We hire quickly and hire slowly: 90-day trial, then either fully in or generously out.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content">
          <p className="overline mb-4">Open roles</p>
          <h2 className="font-display text-4xl mb-10">Roles we're hiring for right now.</h2>
          <div className="space-y-4">
            {roles.map((r) => (
              <div key={r.title} className="rounded-card border border-hairline bg-paper p-6 md:flex md:items-start md:justify-between gap-6">
                <div className="flex-1">
                  <p className="font-display text-2xl">{r.title}</p>
                  <p className="text-sm text-muted mt-1">{r.location} · {r.type} · {r.stack}</p>
                  <p className="text-body mt-3 max-w-2xl">{r.summary}</p>
                </div>
                <div className="mt-4 md:mt-0">
                  <Link href={`mailto:${siteConfig.contact.hiringEmail}?subject=Applying · ${r.title}`}>
                    <Button variant="secondary">Apply →</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding text-center">
        <div className="container-content max-w-2xl">
          <h2 className="font-display text-3xl">Don't see your role?</h2>
          <p className="mt-4 text-body">
            Send a short note to <Link href={`mailto:${siteConfig.contact.hiringEmail}`} className="text-accent underline">{siteConfig.contact.hiringEmail}</Link> with what you'd want to own.
          </p>
        </div>
      </section>
      <Footer />
    </>
  );
}
