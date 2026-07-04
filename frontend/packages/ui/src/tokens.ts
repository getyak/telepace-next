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

  ink: "#141414",
  inkSoft: "#2A2622",
  body: "#6B6660",
  muted: "#8A857F",
  hairline: "#E8E4DB",

  accent: "#4A5D3B",
  accentHover: "#3D4E30",
  accentSoft: "#DCE4D2",

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
