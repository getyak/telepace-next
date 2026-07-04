const messages = [
  {
    from: "interviewer" as const,
    text: "What were you hoping to accomplish when you signed up?",
  },
  {
    from: "respondent" as const,
    text: "Mostly, I wanted a way to talk to more users without hiring a full research team…",
  },
  {
    from: "interviewer" as const,
    text: "Got it. What made you stop trying to hire — was it budget, or something else?",
  },
];

// Height percentages for the 6 waveform bars — a fixed, slightly irregular
// pattern reads as a real signal rather than a uniform metronome.
const waveBars = [45, 80, 60, 95, 55, 70];

export function HeroConversation() {
  return (
    <div className="rounded-card border border-hairline bg-paper-elevated overflow-hidden">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 text-xs text-muted">
        <div className="w-2 h-2 rounded-full bg-accent motion-safe:animate-live-pulse" />
        live · Interviewer
      </div>
      <div className="p-5 space-y-3 text-[15px]">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.from === "respondent"
                ? "rounded-card bg-ink text-paper px-4 py-3 max-w-[85%] ml-auto motion-safe:animate-message-in"
                : "rounded-card bg-paper px-4 py-3 border border-hairline motion-safe:animate-message-in"
            }
            style={{ animationDelay: `${i * 600}ms` }}
          >
            <p>{m.text}</p>
            {m.from === "respondent" && (
              <div className="mt-2.5 flex items-end gap-[3px] h-4" aria-hidden="true">
                {waveBars.map((h, barIndex) => (
                  <span
                    key={barIndex}
                    className="w-[3px] origin-bottom rounded-pill bg-paper/50 motion-safe:animate-wave-bar"
                    style={{ height: `${h}%`, animationDelay: `${barIndex * 160}ms` }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
