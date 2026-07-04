/**
 * The hero's conversation mock — the one place the site "sounds" alive.
 *
 * Three restrained, CSS-only touches (all disabled under
 * prefers-reduced-motion, see globals.css):
 *   1. messages fade in once, 600ms apart, then rest — no looping typewriter
 *   2. the live dot pulses on a calm 2.4s cycle
 *   3. a small waveform breathes at the foot of the respondent bubble
 */

const WAVE_BARS = [
  { height: 8, delay: 0 },
  { height: 13, delay: 350 },
  { height: 10, delay: 150 },
  { height: 14, delay: 500 },
  { height: 9, delay: 250 },
  { height: 12, delay: 600 },
  { height: 8, delay: 100 },
];

export function HeroConversation() {
  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-paper-elevated">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 text-xs text-muted">
        <div className="tp-pulse-slow h-2 w-2 rounded-pill bg-accent" aria-hidden />
        live · Interviewer
      </div>
      <div className="space-y-3 p-5 text-[15px]">
        <div
          className="tp-fade-in-up rounded-card border border-hairline bg-paper px-4 py-3"
          style={{ animationDelay: "0ms" }}
        >
          What were you hoping to accomplish when you signed up?
        </div>
        <div
          className="tp-fade-in-up ml-auto max-w-[85%] rounded-card bg-ink px-4 py-3 text-paper"
          style={{ animationDelay: "600ms" }}
        >
          Mostly, I wanted a way to talk to more users without hiring a full research team…
          <div className="mt-2.5 flex h-3.5 items-center gap-[3px]" aria-hidden>
            {WAVE_BARS.map((bar, i) => (
              <span
                key={i}
                className="tp-wave-bar w-[2px] rounded-pill bg-paper/50"
                style={{ height: bar.height, animationDelay: `${bar.delay}ms` }}
              />
            ))}
          </div>
        </div>
        <div
          className="tp-fade-in-up rounded-card border border-hairline bg-paper px-4 py-3"
          style={{ animationDelay: "1200ms" }}
        >
          Got it. What made you stop trying to hire — was it budget, or something else?
        </div>
      </div>
    </div>
  );
}
