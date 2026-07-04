import type { Config } from "tailwindcss";
import { colors, fonts, radii, shadows } from "./tokens";

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        paper: colors.paper,
        "paper-elevated": colors.paperElevated,
        "paper-sunken": colors.paperSunken,
        ink: colors.ink,
        "ink-soft": colors.inkSoft,
        body: colors.body,
        muted: colors.muted,
        hairline: colors.hairline,
        accent: colors.accent,
        "accent-hover": colors.accentHover,
        "accent-soft": colors.accentSoft,
        terracotta: colors.terracotta,
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
      },
      fontFamily: {
        display: fonts.display.split(",").map((s) => s.trim().replace(/^"|"$/g, "")),
        sans: fonts.body.split(",").map((s) => s.trim().replace(/^"|"$/g, "")),
        mono: fonts.mono.split(",").map((s) => s.trim().replace(/^"|"$/g, "")),
      },
      borderRadius: {
        input: radii.input,
        btn: radii.button,
        card: radii.card,
        pill: radii.pill,
      },
      boxShadow: {
        hairline: shadows.hairline,
        hover: shadows.hover,
        overlay: shadows.overlay,
      },
      maxWidth: {
        content: "1120px",
      },
    },
  },
};

export default preset;
