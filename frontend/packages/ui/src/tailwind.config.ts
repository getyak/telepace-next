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
      keyframes: {
        skeleton: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(0.82)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        waveform: {
          "0%, 100%": { transform: "scaleY(0.35)" },
          "50%": { transform: "scaleY(1)" },
        },
        "dialog-in": {
          from: { opacity: "0", transform: "scale(0.98)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "live-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(1.15)" },
        },
        "message-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "wave-bar": {
          "0%, 100%": { transform: "scaleY(0.35)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        skeleton: "skeleton 1.8s ease-in-out infinite",
        "pulse-slow": "pulse-slow 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in-up": "fade-in-up 600ms cubic-bezier(0.22, 1, 0.36, 1) both",
        waveform: "waveform 2.4s ease-in-out infinite",
        "dialog-in": "dialog-in 220ms cubic-bezier(0.4, 0, 0.2, 1)",
        "live-pulse": "live-pulse 2.4s ease-in-out infinite",
        "message-in": "message-in 500ms ease-out both",
        "wave-bar": "wave-bar 2.4s ease-in-out infinite",
      },
    },
  },
};

export default preset;
