"use client";

import { useEffect, useState } from "react";

const MESSAGES = [
  { from: "interviewer" as const, text: "What were you hoping to accomplish when you signed up?" },
  {
    from: "respondent" as const,
    text: "Mostly, I wanted a way to talk to more users without hiring a full research team…",
  },
  {
    from: "interviewer" as const,
    text: "Got it. What made you stop trying to hire — was it budget, or something else?",
  },
];

const WAVEFORM_BARS = [0.5, 0.8, 0.35, 1, 0.6, 0.9, 0.4];

/**
 * The single always-on animation this page runs: three messages fade in in
 * sequence, then hold — no infinite typewriter loop, that reads as cheap.
 */
export function HeroConversation() {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (visible >= MESSAGES.length) return;
    const timer = setTimeout(() => setVisible((v) => v + 1), visible === 0 ? 300 : 600);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <div className="rounded-card border border-hairline bg-paper-elevated overflow-hidden">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 text-xs text-muted">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-pill bg-accent animate-pulse-slow" />
        </span>
        live · Interviewer
      </div>
      <div className="p-5 space-y-3 text-[15px] min-h-[184px]">
        {MESSAGES.slice(0, visible).map((m, i) =>
          m.from === "interviewer" ? (
            <div
              key={i}
              className="rounded-card bg-paper px-4 py-3 border border-hairline motion-safe:animate-fade-in-up"
            >
              {m.text}
            </div>
          ) : (
            <div
              key={i}
              className="rounded-card bg-ink text-paper px-4 py-3 max-w-[85%] ml-auto motion-safe:animate-fade-in-up"
            >
              <p>{m.text}</p>
              <div className="mt-2.5 flex items-end gap-[3px] h-4" aria-hidden>
                {WAVEFORM_BARS.map((h, bar) => (
                  <span
                    key={bar}
                    className="w-[3px] rounded-pill bg-paper/50 motion-safe:animate-waveform"
                    style={{
                      height: `${h * 100}%`,
                      animationDelay: `${bar * 140}ms`,
                      animationDuration: `${2200 + bar * 90}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
