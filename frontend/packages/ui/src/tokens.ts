/**
 * telepace design tokens.
 *
 * Aesthetic: warm off-white + serif display + muted sage accent.
 * Reference: Listen Labs, Anthropic.com, Mercury. Editorial, quiet luxury.
 */

export const colors = {
  paper: "#F8F6F1",
  paperElevated: "#FAF8F3",
  paperSunken: "#EFEBE2",
  // A deeper warm tone for the "desk" behind a lit stage card — pushed to ~8%
  // below paperElevated so the card is felt to rest ON something, not float in
  // a faint wash. The whole letter-on-a-desk metaphor lives on this contrast.
  desk: "#E4DDCE",

  // A four-step ink ladder — each rung is visibly separated (≥1.6:1 vs its
  // neighbour) so type hierarchy rests on real tone, not just size/opacity.
  // ink (headings) → body (prose, ~8:1) → muted (labels, ~4.6:1 AA) →
  // faint (decorative only, sub-AA by design, never load-bearing).
  ink: "#141414",
  inkSoft: "#2A2622",
  body: "#4A4640",
  muted: "#7A746C",
  faint: "#9A948C",
  hairline: "#E8E4DB",

  accent: "#4A5D3B",
  accentHover: "#3D4E30",
  accentSoft: "#DCE4D2",
  // A visible-but-quiet wash for the current-question highlight band — a hair
  // of sage on paper (~1.1:1) that actually reads, unlike accent-soft at low
  // opacity which vanished into the paper.
  questionWash: "#EDF1E4",

  terracotta: "#B45A3C",

  success: "#3C7A5C",
  warning: "#B8862B",
  danger: "#A83A2F",
} as const;

export const radii = {
  input: "4px",
  button: "8px",
  card: "12px",
  // Chat surfaces: the speech-bubble geometry (bubble) and the composer input
  // well (well) sit between card and pill — named so they resolve through the
  // scale instead of arbitrary `rounded-[18px]` / `rounded-[20px]`.
  bubble: "18px",
  well: "20px",
  pill: "999px",
} as const;

export const shadows = {
  none: "none",
  hairline: "0 0 0 1px rgba(20, 20, 20, 0.06)",
  hover: "0 2px 8px rgba(0, 0, 0, 0.04)",
  overlay: "0 10px 32px rgba(0, 0, 0, 0.08)",
} as const;

export const spacing = {
  sectionY: "8rem",
  sectionYMobile: "5rem",
  containerX: "1.5rem",
  contentMax: "1120px",
} as const;

/**
 * Font stacks lead with the `next/font` CSS variables set in the root
 * layout; the named families remain as fallbacks for non-Next consumers.
 */
export const fonts = {
  display: `var(--font-display), "Instrument Serif", "Fraunces", "Tiempos Headline", ui-serif, Georgia, serif`,
  body: `var(--font-body), "Inter", "Söhne", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`,
  mono: `"JetBrains Mono", "Söhne Mono", ui-monospace, "SF Mono", monospace`,
} as const;

export const motion = {
  fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
  base: "220ms cubic-bezier(0.4, 0, 0.2, 1)",
  slow: "420ms cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

/**
 * Press feedback — the physical half of the motion vocabulary.
 *
 * Two rules, both from Apple's *Designing Fluid Interfaces*:
 *
 * 1. "Respond on the way down." The dip is faster than the release
 *    (`downDuration` < `upDuration`), so a press feels *answered* rather than
 *    animated. Symmetric timing reads as a slow toggle; this reads as touch.
 *
 * 2. Scale is graded by element size, because what the eye judges is EDGE
 *    DISPLACEMENT, not the ratio. A uniform scale makes small controls look
 *    inert and large ones look rubbery: at 0.97 a 24px icon shifts 0.36px
 *    (invisible) while a 640px card shifts 9.6px (sloppy).
 *
 *    Travel for a centred scale is `size × (1 − scale) / 2`. Each rung's scale
 *    is fitted so travel stays near ~0.85px across that rung's REAL size band,
 *    which holds every press in the product inside 0.5–1.1px over a 20× size
 *    range — so a 20px icon and a 640px card read as the same gesture:
 *
 *      icon    20–32px   0.930  → 0.70–1.12px
 *      control 32–48px   0.960  → 0.64–0.96px   (h-8/h-10/h-12 buttons)
 *      row    180–320px  0.993  → 0.63–1.12px   (nav items, list rows)
 *      card   360–640px  0.997  → 0.54–0.96px
 *
 * Consumed as the `.tp-press-*` classes in globals.css — these constants are
 * the single source those rules are derived from.
 */
export const press = {
  scale: {
    icon: 0.93,
    control: 0.96,
    row: 0.993,
    card: 0.997,
  },
  /**
   * Inline text links (nav, footer, wordmark) dip in OPACITY, not scale — a
   * transform on text re-rasterises the glyphs (visible softening under
   * subpixel AA) and nudges the baseline inside a text row. Same timing as the
   * scale rungs, so a link and a button still feel like one gesture.
   */
  textOpacity: 0.55,
  /** Dip: fast enough to feel like acknowledgement, not animation. */
  downDuration: "75ms",
  /** Release: eases back, so the finger leads and the surface follows. */
  upDuration: "150ms",
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;
