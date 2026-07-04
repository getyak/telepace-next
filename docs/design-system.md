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
| `success` | `#3C7A5C` | Positive status (soft: `success/10`) |
| `warning` | `#B8862B` | Caution status (soft: `warning/10`) |
| `danger` | `#A83A2F` | Errors, destructive actions (soft: `danger/10`) |

Never reach for Tailwind's default palette (`red-600`, `blue-500`, `green-500`, …) —
every color in `apps/**` must resolve to one of the tokens above. This is enforced
by `pnpm check:colors` in CI.

## Typography

```
Display  Instrument Serif    clamp(2.5rem, 5vw, 4.5rem)  -0.02em  line-height 1.05
H1       Instrument Serif    clamp(2rem, 3.5vw, 3rem)    -0.02em  line-height 1.1
H2       Instrument Serif    1.75rem                     -0.015em line-height 1.15
Body     Inter               1rem                        -0.011em line-height 1.55
Overline Inter Medium        0.75rem uppercase           +0.14em
```

## Components (@telepace/ui)

- `Button(variant: primary | secondary | ghost | danger | inverse | inverse-outline, size: sm | md | lg, loading?: boolean)`
- `Card` + `CardHeader` + `CardBody` + `CardFooter`
- `Input`, `Textarea`, `Label`
- `ChatBubble`, `ChatFeed`, `ChatComposer`, `VoiceOrb`
- `Spinner`, `Badge(variant: neutral | accent | success | warning | danger)`
- `Skeleton` (opacity breathing, never a shimmer sweep)
- `EmptyState`, `Dialog` (native `<dialog>`), `DropdownMenu` + `DropdownMenuItem`
- `Toaster` + `toast.{success,error,warning,info}`
- `icons.*` — hand-drawn stroke-1.5 line icons (`packages/ui/src/icons.tsx`); never pull in an icon library wholesale

Every list/table page pairs with an `EmptyState` for the zero-data case and
`Skeleton` rows (not a blank flash) while loading.

## Motion

| Token | Duration | Curve |
|---|---|---|
| fast | 150ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| base | 220ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| slow | 420ms | `cubic-bezier(0.22, 1, 0.36, 1)` |

Fade + 8–12px upward translate on scroll. No parallax. No gradient blobs.

**Motion budget: at most one persistent (looping) animation per screen** — e.g.
the hero's waveform bars, or a live-status pulse, never both plus a scroll
parallax. Everything else animates once (enter/exit) and holds. All animation
respects `prefers-reduced-motion: reduce` (enforced globally in `globals.css`);
prefer Tailwind's `motion-safe:` variant when adding a new animated class.

## Typography rules

- Italic + `text-accent` is reserved for a single key phrase per heading (see
  Hero, FinalCTA) — never a whole sentence, never used twice in one viewport.
- Numbered steps/indices (`01`, `02`, …) render in `font-display`, not `font-mono`
  or default sans, so they read as part of the editorial system.
- Sections alternate `bg-paper` / `bg-paper-elevated` with a `border-hairline`
  seam between them — never two consecutive sections with the same fill.

## Wording

- **"Sign in"**, never "Log in" — across nav, buttons, and page copy, everywhere.
- CTA pair is always **"Start free"** (primary) / **"Try a live 60-sec interview →"**
  (secondary) — don't introduce new variants ("Try for free", "See a live demo").

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
