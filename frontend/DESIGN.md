# telepace DESIGN.md — brand contract for humans and agents

Read this before touching anything under `frontend/`. It is the design
authority; `packages/ui/src/tokens.ts` is the machine-readable source of the
values referenced here. If the two disagree, tokens.ts wins on values, this
file wins on intent.

## Identity

**Editorial quiet luxury.** The interface should read like a research document
that has been carefully edited — not like a dashboard. References: Anthropic.com
(editorial restraint), Mercury (data as typography), Listen Labs (category
peer we deliberately do NOT look like — they are "clean SaaS blue"; our warm
paper + serif identity is the moat, never trade it for a generic SaaS look).

The product's promise is "insights that read like a researcher wrote them."
The visual language is that promise made visible: paper, ink, quotation,
provenance.

## Color — the paper/ink system

All values in `tokens.ts`. Semantics, not hex, are the contract:

- **Paper ladder** `paper → paperElevated → paperSunken → desk`. `desk`
  (#E4DDCE) exists for one metaphor: a lit card resting ON a desk. Use it
  behind a hero artifact (a study card, a report, the live-demo card) so the
  card is felt to rest on something — never as a general section background.
- **Ink ladder** `ink → inkSoft → body → muted → faint`. Each rung is a real
  contrast step. `faint` is decorative only and never load-bearing; `muted`
  is the floor for anything that must be read (AA).
- **Accent (sage #4A5D3B)** is for action and coverage — buttons, progress,
  the current-question wash. It is an accent, not a theme: if a screen is
  more than ~5% sage, something is wrong.
- **Terracotta (#B45A3C)** has two jobs: danger surfaces (delete, quota
  exceeded) AND small human moments — the tag on a verbatim quote, a
  respondent identity mark. Use it sparingly for warmth where a real person
  appears; never for generic emphasis.
- Never: pure white backgrounds, colored gradients, blue links, heavy
  drop shadows. Shadows top out at `overlay` (see tokens) and default to
  `hairline` — depth comes from the paper ladder, not from blur.

## Type

- **Display serif** (`font-display`) for h1–h3 and "artifact" numerals only.
  Italic serif is allowed inside a display heading for emphasis (see the
  marketing hero) — never in body text.
- **Body** is Inter at -0.011em tracking; prose stays in the `body` ink rung.
- **Labels** (section eyebrows, table headers, stat captions) are small
  letterspaced caps with a top rule — the "YOUR STUDIES" / "DELIVERED"
  pattern. This is the house label style; do not invent alternates.

## Data is typography (the Audience-page standard)

The Audience page is the reference rendering for data density: serif
display numerals, letterspaced caps captions, top-rule alignment, no widget
chrome. Every metric surface in the product (billing usage, study progress,
insight confidence) must meet this bar:

1. Key numbers render in the display serif at a size that makes them the
   object of the layout, not an annotation.
2. Captions above numbers, small caps, with the top rule.
3. Progress is shown as a thin accent bar on a hairline track — visible even
   at 0% (the empty track must read as a track, not vanish).
4. No card-in-card nesting for a single stat; stats sit on the shared surface
   separated by hairlines.

## Radii, borders, motion

- Radii by role (`tokens.radii`): input 4 / button 8 / card 12 / chat bubble
  18 / composer well 20 / pill 999. Pick through the scale — arbitrary
  `rounded-[Npx]` values are a smell.
- Borders are `hairline` almost everywhere. A visible border heavier than
  1px needs a reason (danger zone uses terracotta/30).
- Motion is one-shot and restrained: `tp-reveal` fades in once, press
  feedback follows the graded-scale system in `tokens.press` (respond on the
  way down; travel ≈ 0.85px regardless of element size). No loops, no
  scroll-linked animation, and everything honors `prefers-reduced-motion`.
- Progressive enhancement is law: content must be fully visible without
  JavaScript. Animations may only hide content after client JS stamps
  `tp-js` on `<html>` (see `Reveal.tsx`) — never in default CSS.

## Voice of empty states

An empty state is onboarding, not an apology. It gets: a display-serif
sentence in the product's voice ("What are we learning today?"), one concrete
next action, and where possible example content (study templates) rather
than a lone icon. Skeletons mean "loading"; a dashed/outlined document form
means "not written yet" — do not use a skeleton for content that is simply
absent.

## Evidence and honesty

- Verbatim quotes are the soul of the product: left-rule blockquote, italic,
  and ALWAYS with provenance (interview #, role) attached. A quote without a
  source is not allowed in the UI.
- Never render invented data as if it were the user's. Placeholder companies,
  fake teammates, fake API keys are forbidden in authenticated surfaces —
  derive from the signed-in identity or show an honest empty state.

## Components

Use the 13 components in `packages/ui` (Button, Card, Chat, Dialog, Field,
ProgressBar, EmptyState, …) before writing new ones. New components must be
added to `packages/ui`, follow this contract, and use tokens — no raw hex,
no ad-hoc radii, no new shadows.
