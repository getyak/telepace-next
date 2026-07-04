"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, ChatFeed, ChatComposer, type ChatMessage } from "@telepace/ui";
import { routes } from "@telepace/config";
import { PageHeader } from "@/components/marketing/site-chrome";

const SCRIPT: Array<{ prompt: string }> = [
  { prompt: "Hi, thanks for taking a minute. What were you hoping to accomplish when you signed up for telepace?" },
  { prompt: "That's a common thread. What made you stop trying to hire a full-time researcher — was it budget, or something else?" },
  { prompt: "Interesting. If a magic wand solved the interview-scheduling headache, what would 'solved' look like for you?" },
  { prompt: "Perfect. Last one — what have you already tried that didn't quite work?" },
  { prompt: "That's incredibly helpful. Thank you. I've saved this and the team will read every word." },
];

export default function DemoPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "0", role: "interviewer", text: SCRIPT[0].prompt },
  ]);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  function handleSend(text: string) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "respondent", text }]);
    const next = step + 1;
    setStep(next);
    setTimeout(() => {
      if (next >= SCRIPT.length) {
        setDone(true);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "interviewer", text: SCRIPT[next].prompt },
      ]);
    }, 700);
  }

  return (
    <>
      <PageHeader
        eyebrow="60-second live demo"
        title={<>Pretend you're a user.</>}
        lede="This is exactly what a respondent sees. The interviewer probes, tracks coverage, and knows when to stop. Type a few replies and get a feel."
      />

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-12 gap-10">
          <div className="md:col-span-8">
            <div className="rounded-card border border-hairline bg-paper-elevated overflow-hidden flex flex-col h-[560px]">
              <div className="flex items-center gap-2 border-b border-hairline px-5 py-3 text-xs text-muted">
                <div className="w-2 h-2 rounded-full bg-accent" />
                live · demo interview · {done ? "wrapped" : `question ${step + 1} of ${SCRIPT.length}`}
              </div>
              <div className="flex-1 overflow-y-auto px-5">
                <ChatFeed messages={messages} />
              </div>
              {done ? (
                <div className="px-5 py-6 border-t border-hairline text-center">
                  <p className="font-display text-2xl mb-2">That's a full interview.</p>
                  <p className="text-body text-sm mb-4">
                    In a real study, telepace runs 100 of these in parallel and clusters the answers into themes.
                  </p>
                  <Link href={routes.signup}><Button>Run one for real →</Button></Link>
                </div>
              ) : (
                <ChatComposer onSend={handleSend} placeholder="Type a reply and press Enter…" />
              )}
            </div>
          </div>
          <aside className="md:col-span-4 space-y-6">
            <div className="rounded-card border border-hairline bg-paper p-6">
              <p className="overline mb-3">What's happening under the hood</p>
              <ul className="text-sm text-body space-y-2">
                <li>· Interviewer chooses each follow-up from your outline + prior turns</li>
                <li>· Coverage tracker knows what's still open</li>
                <li>· PII policy redacts before storage</li>
                <li>· Escalation policy stops the run if it detects distress</li>
              </ul>
            </div>
            <div className="rounded-card border border-hairline bg-ink text-paper p-6">
              <p className="overline text-paper/70 mb-3">Prefer voice?</p>
              <p className="text-sm mb-4">The real interviewer is fully voice-capable — browser, outbound phone, inbound hotline.</p>
              <Link href={routes.product.voice}><Button variant="secondary" className="border-paper/30 text-paper hover:bg-paper/10">Explore voice →</Button></Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
