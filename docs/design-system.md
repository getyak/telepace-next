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
| `success` | `#3C7A5C` | Positive status / success badges & toasts (soft: `success/10`) |
| `warning` | `#B8862B` | Caution status / warning badges & toasts (soft: `warning/10`) |
| `danger` | `#A83A2F` | Errors, destructive actions — the **only** acceptable "red", never Tailwind's `red-*` (soft: `danger/10`) |

Radii also include a `pill` token (`999px`, `rounded-pill`) for tags and status chips, alongside `input` (4px), `button`/`btn` (8px), and `card` (12px).

Never reach for Tailwind's default palette (`text-red-600`, `bg-blue-500`, `text-green-600`, `bg-gray-100`, …)
anywhere in `apps/**` — every color must resolve to one of the tokens above. This is enforced by
`pnpm check:colors` and `pnpm check:tokens` in CI.

## Typography

```
Display  Instrument Serif    clamp(2.5rem, 5vw, 4.5rem)  -0.02em  line-height 1.05
H1       Instrument Serif    clamp(2rem, 3.5vw, 3rem)    -0.02em  line-height 1.1
H2       Instrument Serif    1.75rem                     -0.015em line-height 1.15
Body     Inter               1rem                        -0.011em line-height 1.55
Overline Inter Medium        0.75rem uppercase           +0.14em
```

## Components (@telepace/ui)

- `Button(variant: primary | secondary | ghost | danger | inverse | inverse-outline, size: sm | md | lg, loading?)`
  — `loading` renders a built-in 14px spinner and blocks clicks; never hand-roll
  `{submitting ? "…" : "…"}`-only states. `inverse` / `inverse-outline` are for
  dark (`bg-ink`) sections — no more `className` color overrides on buttons.
- `Card` + `CardHeader` + `CardBody` + `CardFooter`
- `Input`, `Textarea`, `Label`
- `ChatBubble`, `ChatFeed`, `ChatComposer`, `VoiceOrb`
- `Spinner` — single-color arc, ~800ms uniform rotation, `currentColor`
- `Badge(variant: neutral | accent | success | warning | danger)` — soft fills only
- `Skeleton` — `paper-sunken` block with a 1.8s opacity breath. **No shimmer
  sweep** — a scanning highlight clashes with the editorial aesthetic.
- `EmptyState(icon, title, description, action)` — thin-line icon, display-serif
  title, one body sentence, one primary action
- `Dialog` — native `<dialog>`, `shadow-overlay`, 0.98 → 1 scale entry over `base`
- `DropdownMenu` (+ Trigger/Content/Item/Separator) — used by `UserMenu` and row actions
- `Toaster` / `toast` — token-styled, colored-dot kind indicator

## Icons (@telepace/icons)

Hand-inlined line icons: 16px viewBox, `stroke-width: 1.5`, round caps,
`currentColor`. The hamburger is **two** thin lines, not three fat ones. Do not
add an icon library dependency; add icons one at a time as needed.

## Motion

| Token | Duration | Curve |
|---|---|---|
| fast | 150ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| base | 220ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| slow | 420ms | `cubic-bezier(0.22, 1, 0.36, 1)` |

Fade + 8–12px upward translate on scroll. No parallax. No gradient blobs.

**Motion budget: at most one persistent (looping) animation per screen.** The
homepage spends its budget on the hero waveform; nothing else on that screen
may loop. One-shot entrances (fade-in-up) don't count against the budget.
Named loops: live-dot pulse is 2.4s (Tailwind's 1s `animate-pulse` is too
eager), waveform bars 2.6s, skeleton breath 1.8s, spinner 800ms. Every
animation must degrade to a static state under `prefers-reduced-motion`.

## Copy rules

- Sign-in wording is **"Sign in" / "Sign out"** everywhere. Never "Log in".
- Primary CTA is **"Start free"**; secondary demo CTA is
  **"Try a live 60-sec interview →"**. Don't invent variants per page.
- Italic `text-accent` spans are reserved for the one key phrase of a heading
  — not for decoration.
- Step / question numerals use `font-display` (see HowItWorks, outline lists).
- Marketing sections alternate `bg-paper` / `bg-paper-elevated`, separated by
  `border-hairline`. No third background color.
- No fabricated trust signals: no fake customer logos, no compliance claims
  (SOC 2 etc.) that aren't literally true.

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
- Any icon set that isn't `@telepace/icons` (hand-inlined, geometric)
- **Tailwind default palette classes** (`text-red-600`, `bg-blue-500`, …) —
  every color goes through tokens. CI enforces this via
  `frontend/scripts/design-guard.sh`.
