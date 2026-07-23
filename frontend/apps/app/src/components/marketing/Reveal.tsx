"use client";

/**
 * One-shot scroll reveal, progressively enhanced. Server-rendered content is
 * fully visible by default — crawlers, JS-off browsers, and failed script
 * loads all get a complete page. On mount we stamp `tp-js` on <html>, which
 * is what allows CSS to hide `.tp-reveal` content at all; elements already
 * inside the viewport at that moment are marked visible in the same tick so
 * nothing on screen blinks out. Below-the-fold elements then ease in the
 * first time they enter the viewport — and never animate again (no
 * scroll-linked loops; a fade-in-once, same philosophy as tp-fade-in-up).
 *
 * Reduced motion is handled in CSS: under prefers-reduced-motion the
 * .tp-reveal class has no transform/opacity offset at all, so content is
 * simply visible.
 */

import { useEffect, useRef, useState } from "react";

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Client JS is live — from here on CSS may treat .tp-reveal as hidden.
    document.documentElement.classList.add("tp-js");
    // No IntersectionObserver (very old browsers): just show the content.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    // Already on screen at hydration → visible immediately, no blink-out.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    observer.observe(el);
    // Backstop: a renderer that runs JS but never scrolls (Googlebot's
    // rendering snapshot, print, full-page screenshots) would otherwise
    // capture below-the-fold content at opacity 0 forever. If the observer
    // hasn't fired within a few seconds, show the content anyway — the
    // animation is an enhancement, visibility is the contract.
    const backstop = setTimeout(() => {
      setVisible(true);
      observer.disconnect();
    }, 3000);
    return () => {
      clearTimeout(backstop);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`tp-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
