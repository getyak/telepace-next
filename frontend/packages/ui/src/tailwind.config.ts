import type { Config } from "tailwindcss";
import { colors, fonts, radii, shadows } from "./tokens";

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        paper: colors.paper,
        "paper-elevated": colors.paperElevated,
        "paper-sunken": colors.paperSunken,
        desk: colors.desk,
        ink: colors.ink,
        "ink-soft": colors.inkSoft,
        body: colors.body,
        muted: colors.muted,
        faint: colors.faint,
        hairline: colors.hairline,
        accent: colors.accent,
        "accent-hover": colors.accentHover,
        "accent-soft": colors.accentSoft,
        "question-wash": colors.questionWash,
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
        bubble: radii.bubble,
        well: radii.well,
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
      // Size-specific tracking + leading (Apple/WWDC "type changes shape with
      // size"): large display sizes get progressively tighter tracking and
      // tighter leading; body sizes sit near 0 tracking with comfortable
      // leading. zh resets tracking to 0 via an unlayered rule in globals.css
      // (CJK glyphs are full-width and never want negative tracking).
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.5", letterSpacing: "0.005em" }],
        sm: ["0.875rem", { lineHeight: "1.5", letterSpacing: "0" }],
        base: ["1rem", { lineHeight: "1.6", letterSpacing: "0" }],
        lg: ["1.125rem", { lineHeight: "1.55", letterSpacing: "-0.006em" }],
        xl: ["1.25rem", { lineHeight: "1.4", letterSpacing: "-0.01em" }],
        "2xl": ["1.5rem", { lineHeight: "1.25", letterSpacing: "-0.014em" }],
        "3xl": ["1.875rem", { lineHeight: "1.2", letterSpacing: "-0.018em" }],
        "4xl": ["2.25rem", { lineHeight: "1.12", letterSpacing: "-0.022em" }],
        "5xl": ["3rem", { lineHeight: "1.08", letterSpacing: "-0.026em" }],
        "6xl": ["3.75rem", { lineHeight: "1.04", letterSpacing: "-0.03em" }],
        "7xl": ["4.5rem", { lineHeight: "1.02", letterSpacing: "-0.032em" }],
      },
      letterSpacing: {
        tighter: "-0.04em",
        tight: "-0.025em",
        normal: "0",
        wide: "0.02em",
        // Hero-scale serif display (clamp sizes that the fontSize scale can't
        // reach) — apply as `tracking-display`.
        display: "-0.032em",
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
