# Design System

Source of truth: `frontend/packages/ui/src/tokens.ts`.

## Aesthetic pillars

- **Warm off-white**, never pure `#FFF`. `#F8F6F1` primary.
- **Serif display + sans body**. Instrument Serif for headings, Inter for body.
- **Muted sage accent** `#4A5D3B` for the primary action colour. Never bright brand blue.
- **Hairline borders over shadows**. `1px solid #E8E4DB`. Shadow only on hover (`0 2px 8px rgba(0,0,0,0.04)`).
- **Small radii**. Buttons `8px`, cards `12px`, inputs `4px`. Never bubbly.
- **Generous whitespace**. Section padding `py-32` (128px) on desktop; content max-width `1120px`.

## Color scale

| Token | Value | Use |
|---|---|---|
| `paper` | `#F8F6F1` | Primary background |
| `paper-elevated` | `#FAF8F3` | Cards on paper |
| `paper-sunken` | `#EFEBE2` | Well/section dividers |
| `ink` | `#141414` | Primary text / dark buttons |
| `ink-soft` | `#2A2622` | Hover on ink |
| `body` | `#6B6660` | Body copy |
| `muted` | `#8A857F` | Secondary copy |
| `hairline` | `#E8E4DB` | Borders |
| `accent` | `#4A5D3B` | Primary CTA / links / active state |
| `accent-soft` | `#DCE4D2` | Pills, active fills |
| `terracotta` | `#B45A3C` | Optional warm emphasis |

## Typography

```
Display  Instrument Serif    clamp(2.5rem, 5vw, 4.5rem)  -0.02em  line-height 1.05
H1       Instrument Serif    clamp(2rem, 3.5vw, 3rem)    -0.02em  line-height 1.1
H2       Instrument Serif    1.75rem                     -0.015em line-height 1.15
Body     Inter               1rem                        -0.011em line-height 1.55
Overline Inter Medium        0.75rem uppercase           +0.14em
```

## Components (@telepace/ui)

- `Button(variant: primary | secondary | ghost, size: sm | md | lg)`
- `Card` + `CardHeader` + `CardBody` + `CardFooter`
- `Input`, `Textarea`, `Label`
- `ChatBubble`, `ChatFeed`, `ChatComposer`, `VoiceOrb`

## Motion

| Token | Duration | Curve |
|---|---|---|
| fast | 150ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| base | 220ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| slow | 420ms | `cubic-bezier(0.22, 1, 0.36, 1)` |

Fade + 8–12px upward translate on scroll. No parallax. No gradient blobs.

## Design references (aesthetic anchor)

- `listenlabs.ai` — editorial serif + off-white + sage
- `anthropic.com` — warm palette, restraint
- `mercury.com` — quiet luxury
- `linear.app` — minimal density

## What to avoid

- Pure `#FFF` backgrounds
- Bright brand blue (SaaS default)
- Rounded-heavy shapes (`rounded-2xl` bubbles)
- Multi-color gradients
- Drop shadows above `y:2 blur:8 opacity:0.04`
- Any icon set that isn't Radix Icons (or an equivalent geometric set)
