/**
 * Recharts theme tokens mapped from the telepace design system.
 *
 * Aesthetic: warm-beige editorial with a sage-green accent.
 */

import { colors, fonts } from "@telepace/ui/tokens";

// Chart color palette — ordered for categorical series.
// Lead with sage green (accent), then terracotta, warning, success,
// and progressively lighter/muted tints to stay in the warm palette.
export const CHART_COLORS = [
  colors.accent,      // #4A5D3B  sage green
  colors.terracotta,  // #B45A3C  terracotta
  colors.warning,     // #B8862B  amber
  colors.success,     // #3C7A5C  deep green
  colors.body,        // #6B6660  warm gray
  colors.muted,       // #8A857F  lighter gray
  colors.accentHover, // #3D4E30  dark sage
  colors.danger,      // #A83A2F  deep red
] as const;

// Serif stack for number labels on axes and inside bars.
export const CHART_FONT = fonts.display;

// Sans-serif stack for small annotations (base N, tooltips).
export const CHART_BODY_FONT = fonts.body;

export const AXIS_STYLE = {
  fontSize: 12,
  fontFamily: CHART_FONT,
  fill: colors.muted,
  tickLine: false as const,
  axisLine: { stroke: colors.hairline },
  tick: { fill: colors.muted },
} as const;

export const GRID_STYLE = {
  stroke: colors.paperSunken,
  strokeDasharray: "4 4",
} as const;

export const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: colors.paperElevated,
    border: `1px solid ${colors.hairline}`,
    borderRadius: "12px",
    padding: "12px 16px",
    fontFamily: CHART_BODY_FONT,
    fontSize: 13,
    color: colors.ink,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
  },
  labelStyle: {
    fontFamily: CHART_FONT,
    fontSize: 14,
    color: colors.ink,
    marginBottom: 4,
  },
  cursor: { fill: colors.paperSunken, opacity: 0.5 },
} as const;
