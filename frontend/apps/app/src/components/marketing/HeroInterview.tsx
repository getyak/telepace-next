"use client";

/**
 * The hero IS the product: a two-turn scripted mini-interview the visitor
 * can actually answer — by picking a suggestion chip or typing freely.
 *
 * Motion stays inside the existing budget (globals.css):
 *   - messages fade in once (tp-fade-in-up), no loops
 *   - the live dot pulses on the calm 2.4s cycle
 *   - typing dots are transient (only while the interviewer "composes")
 * Everything degrades to a static state under prefers-reduced-motion.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card } from "@telepace/ui";
import { routes } from "@telepace/config";

import { Link } from "@/i18n/navigation";

const WAVE_BARS = [
  { height: 8, delay: 0 },
  { height: 13, delay: 350 },
  { height: 10, delay: 150 },
  { height: 14, delay: 500 },
  { height: 9, delay: 250 },
  { height: 12, delay: 600 },
  { height: 8, delay: 100 },
];

type Message = { id: number; role: "interviewer" | "visitor"; text: string };

export function HeroInterview() {
  const t = useTranslations("marketing.home.heroDemo");
  // Script: q1 → visitor answers → q2 → visitor answers → wrap + CTA.
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "interviewer", text: t("q1") },
  ]);
  const [turn, setTurn] = useState<0 | 1 | 2>(0);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const nextId = useRef(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function answer(text: string) {
    const trimmed = text.trim();
    if (!trimmed || typing || turn >= 2) return;
    setDraft("");
    setMessages((prev) => [...prev, { id: nextId.current++, role: "visitor", text: trimmed }]);
    setTyping(true);
    timer.current = setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: "interviewer",
          text: turn === 0 ? t("q2") : t("wrap"),
        },
      ]);
      setTurn((v) => (v === 0 ? 1 : 2));
    }, 1100);
  }

  const suggestions =
    turn === 0
      ? [t("suggestions1.a"), t("suggestions1.b"), t("suggestions1.c")]
      : turn === 1
        ? [t("suggestions2.a"), t("suggestions2.b"), t("suggestions2.c")]
        : [];

  return (
    <Card className="overflow-hidden shadow-hairline">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 text-xs text-muted">
        <div className="tp-pulse-slow h-2 w-2 rounded-pill bg-accent" aria-hidden />
        {t("liveLabel")}
      </div>

      <div className="space-y-3 p-5 text-[15px]" aria-live="polite">
        {messages.map((m, i) =>
          m.role === "interviewer" ? (
            <div
              key={m.id}
              className="tp-fade-in-up rounded-card border border-hairline bg-paper px-4 py-3"
              style={i === 0 ? { animationDelay: "150ms" } : undefined}
            >
              {m.text}
              {/* The wrap message carries the handoff to the real demo. */}
              {turn === 2 && i === messages.length - 1 && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Link href={routes.demo}>
                    <Button size="sm">{t("ctaFull")}</Button>
                  </Link>
                  <button
                    type="button"
                    className="tp-press-text text-sm text-muted underline underline-offset-4 hover:text-ink transition-[color,opacity] rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                    onClick={() => {
                      setMessages([
                        { id: nextId.current++, role: "interviewer", text: t("q1") },
                      ]);
                      setTurn(0);
                    }}
                  >
                    {t("restart")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              key={m.id}
              className="tp-fade-in-up ml-auto max-w-[85%] rounded-card bg-ink px-4 py-3 text-paper"
            >
              {m.text}
              <div className="mt-2.5 flex h-3.5 items-center gap-[3px]" aria-hidden>
                {WAVE_BARS.map((bar, j) => (
                  <span
                    key={j}
                    className="tp-wave-bar w-[2px] rounded-pill bg-paper/50"
                    style={{ height: bar.height, animationDelay: `${bar.delay}ms` }}
                  />
                ))}
              </div>
            </div>
          ),
        )}

        {typing && (
          <div className="tp-fade-in-up flex w-fit items-center gap-1.5 rounded-card border border-hairline bg-paper px-4 py-3">
            <span className="tp-typing-dot h-1.5 w-1.5 rounded-pill bg-muted" />
            <span className="tp-typing-dot h-1.5 w-1.5 rounded-pill bg-muted" />
            <span className="tp-typing-dot h-1.5 w-1.5 rounded-pill bg-muted" />
          </div>
        )}
      </div>

      {turn < 2 && (
        <div className="border-t border-hairline p-4">
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={typing}
                onClick={() => answer(s)}
                className="tp-press tp-press-control rounded-pill border border-hairline bg-paper px-3 py-1.5 text-sm text-body transition-[color,background-color,border-color,transform] hover:border-ink hover:text-ink disabled:opacity-50 disabled:active:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              answer(draft);
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("inputPlaceholder")}
              // placeholder disappears once typing starts and is never an
              // accessible name — give the field a stable label for screen readers.
              aria-label={t("inputPlaceholder")}
              disabled={typing}
              className="min-w-0 flex-1 rounded-input border border-hairline bg-paper px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-ink disabled:opacity-50"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={typing || !draft.trim()}>
              {t("send")}
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}
