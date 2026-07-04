import Link from "next/link";
import { Button } from "@telepace/ui";
import { routes } from "@telepace/config";
import { Nav, Footer, PageHeader } from "@/components/site-chrome";

export const metadata = {
  title: "Voice",
  description: "Real-time browser voice and outbound phone interviews, moderated by AI.",
};

const specs = [
  { k: "Latency", v: "~380 ms round trip", note: "browser · WSS" },
  { k: "Turn-taking", v: "Endpointed", note: "no walkie-talkie clumsiness" },
  { k: "Language", v: "10 out of the box", note: "EN · ES · FR · DE · JA · ZH · PT · IT · KO · RU" },
  { k: "PII", v: "Redacted before storage", note: "SSN · CC · phone · email" },
  { k: "Consent", v: "Explicit + recoverable", note: "one-tap withdrawal" },
];

const channels = [
  {
    name: "Browser voice",
    tag: "Fastest to launch",
    body: "WebRTC + streaming STT. Respondent clicks a link, presses hold-to-talk, done.",
  },
  {
    name: "Outbound phone call",
    tag: "For respondents who won't fill a form",
    body: "Vapi integration. telepace dials the number, warms up, runs the outline, hangs up gracefully.",
  },
  {
    name: "Inbound hotline",
    tag: "Own your number",
    body: "Attach a Twilio number to a campaign. Anyone who calls gets your interview.",
  },
];

export default function VoicePage() {
  return (
    <>
      <Nav />
      <PageHeader
        eyebrow="Product · Voice"
        title={<>The interviewer that <span className="italic text-accent">listens.</span></>}
        lede="Voice isn't a bolt-on. It's how the best user researchers work — because words on a screen leave the deepest signal on the floor. telepace ships production-grade voice on day one."
      />

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-12 gap-10 items-start">
          <div className="md:col-span-7">
            <p className="overline mb-4">Why voice</p>
            <h2 className="font-display text-4xl mb-6 leading-tight">
              People say more when they don't have to type it.
            </h2>
            <div className="space-y-5 text-body">
              <p>
                Traditional research knows this: a 30-minute call yields 3–5× the actionable signal of a
                written survey. Voice removes the friction of composition, which is where nuance dies.
              </p>
              <p>
                telepace runs the same warmth end-to-end — greeting, probe, silence, follow-up, close —
                with the consistency only software can offer. Nobody's tired at 4 PM. Nobody's off-script.
              </p>
              <p>
                Because we're stream-based (not turn-based), interviews feel like a real conversation —
                not the polite waiting game of most voice bots.
              </p>
            </div>
          </div>
          <aside className="md:col-span-5">
            <div className="rounded-card border border-hairline bg-paper-elevated overflow-hidden">
              <div className="border-b border-hairline px-5 py-3 text-xs text-muted font-mono">
                voiceflow · production-grade Go audio pipeline
              </div>
              <div className="p-5 space-y-2 text-sm font-mono">
                <p><span className="text-muted">◦</span> mic ─▶ VAD ─▶ STT stream</p>
                <p><span className="text-muted">◦</span>            ╰▶ Interviewer</p>
                <p><span className="text-muted">◦</span>                       ↓</p>
                <p><span className="text-muted">◦</span>                     LLM turn</p>
                <p><span className="text-muted">◦</span>                       ↓</p>
                <p><span className="text-muted">◦</span> speaker ◀─ TTS stream ◀╯</p>
              </div>
            </div>
            <dl className="mt-6 space-y-2 text-sm">
              {specs.map((s) => (
                <div key={s.k} className="flex justify-between border-b border-hairline py-2">
                  <dt className="text-muted">{s.k}</dt>
                  <dd className="text-body text-right">
                    {s.v}
                    <span className="block text-xs text-muted">{s.note}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content">
          <p className="overline mb-4">Three channels, one interviewer</p>
          <h2 className="font-display text-4xl mb-12 max-w-2xl">
            Meet respondents where they already are.
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {channels.map((c) => (
              <div key={c.name} className="rounded-card border border-hairline bg-paper p-6">
                <p className="overline mb-3">{c.tag}</p>
                <p className="font-display text-2xl mb-3">{c.name}</p>
                <p className="text-body text-sm">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding text-center">
        <div className="container-content max-w-2xl">
          <h2 className="font-display text-4xl md:text-5xl">Hear it for yourself.</h2>
          <p className="mt-4 text-body">A 60-second live interview with an AI researcher who's had a good day.</p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href={routes.demo}><Button size="lg">Try the demo →</Button></Link>
            <Link href={routes.pricing}><Button size="lg" variant="secondary">See pricing</Button></Link>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
