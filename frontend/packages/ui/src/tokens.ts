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
