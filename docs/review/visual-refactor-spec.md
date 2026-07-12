I now have complete ground truth. Everything is verified:

- **Column split is 5/7** (line 552, 612) — layout fix NOT yet applied.
- **Chat bubbles** still `bg-ink text-paper` black balloon (Chat.tsx:334-339), with `leading-[1.5]` hardcoded.
- **inlineMarkdown.tsx already exists** — bold+italic+code, tested, XSS-safe. Italic branch present. The `a*b*c` guard works but the critique's `5 * 3 * 2` case (space-flanked) would still italicize ` 3 `.
- **`text-accent` = `#4A5D3B`** confirmed (6.5:1 on paper — AA pass).
- **`diffMark()` IIFE wrapper** confirmed — must preserve `d.key`/`d.badge`/`d.className`.
- **ReadinessSpine** = 4-pip `whitespace-nowrap` `flex items-center gap-3` (line 243) — will gain room at 8/12.

I have everything needed to produce the unified, landable spec.

---

# TELEPACE STUDY-CREATION PAGE — UNIFIED VISUAL-REFACTOR SPEC

## 1. THE NEW LOOK

The page reads as a **typeset research manuscript with a quiet editorial margin**, not a chat app beside a form. The discussion-guide document is now the wide star (two-thirds of the canvas) on elevated paper, so the researcher's eye lands on the deliverable — hypotheses march down a fixed sage-serif gutter (H1·H2·H3), questions sit in airy numbered cards, and section overlines carry a short hairline lead-in tick that establishes a real running-head rhythm. The design-chat recedes to a calm one-third rail where the agent speaks as borderless ink on a hairline margin-rule (a book's marginalia), the researcher's own replies are a soft sunken-paper slip, and system lines are tracked whispers — the pure-black iMessage balloon is gone entirely. Inline emphasis renders as genuine weight ("**Methodology Insight**" becomes bold, no literal asterisks leaking), and Chinese and English both hold their line-height and tracking discipline because nothing hardcodes over the zh rules. The result is low-saturation, serif-led, hairline-ruled — the moat, sharpened, not a generic SaaS regression.

## 2. ORDERED CHANGE LIST

Ordered by dependency (layout widths first, since bubbles/doc reading-measure depend on them) then wow-per-effort. **Note:** text-rendering (#4 in the brief) is **already shipped** — `inlineMarkdown.tsx` exists, is wired, tested, XSS-safe; only one optional hardening remains (see #6).

| # | Change | File + exact edit | Effort | Coordination |
|---|--------|-------------------|--------|--------------|
| **1** | **Flip pane dominance to 4/8** — document becomes the wide star | `studies/new/page.tsx` L552 `col-span-5`→`col-span-4`; L612 `col-span-7`→`col-span-8` | **S** | Gates #2 (reading measure) & #3 (bubble rail width). Land first. **QA: verify 4-pip `whitespace-nowrap` ReadinessSpine (Chat.tsx:243) does not overflow at 1280px — it gains room at 8/12, but check.** |
| **2** | **Widen document reading measure** | `studies/new/page.tsx` L690 `max-w-2xl`→`max-w-3xl` (672→768px) | **S** | Depends on #1. Highest wow-per-effort; independently revertable. |
| **3** | **Kill the black balloon; editorial 3-role bubbles** — respondent=sunken slip, agent=borderless hairline rail, system=tracked whisper. **Drop the `leading-[1.5]` hardcode** (let zh inherit 1.7) | `Chat.tsx` L334-340 (see exact edit) | **M** | Do NOT touch `ChatFeed` `gap-3` (L387) — leave vertical rhythm to layout owner. Respondent slip width scales with #1's narrower rail. |
| **4** | **Hypothesis sage gutter** — `H1/H2/H3` become aligned `text-accent` serif in a fixed 2rem column | `studies/new/page.tsx` L720-727 (preserve `d.key`/`d.badge`/`d.className` wrapper) | **S** | Conflict-free. ~AA-safe (`#4A5D3B` = 6.5:1). |
| **5** | **Overline hairline tick** — short lead-in rule before every section label, `mb-2`→`mb-3` | `studies/new/page.tsx` all 6 overlines (persona L708, hypotheses L719, screener L737, questions L753, criteria L795, delivery L809) | **S** | Additive `before:` pseudo. Multiplies slightly-gappy zh overline spacing (pre-existing, not worsened). |
| **6** | **Question card air** — grid gutter, more padding; **NO persistent accent tick** | `studies/new/page.tsx` L770-784 (`p-4`→`p-5`, `flex gap-4`→grid) — leave `<ol>` `tp-diff-flash tp-diff-rail`/`tp-guide-grow` UNTOUCHED | **M** | The transient diff-rail is the ONLY sage rail; do not add a permanent one (critique-confirmed regression risk). |
| **7** | **Harden markdown renderer (optional)** — drop italic branch to kill `5 * 3 * 2`→` 3 ` false positive; zh weight `font-semibold`→`font-medium` to avoid synthetic Songti bold | `inlineMarkdown.tsx` L24, L51, L55-56 | **S** | Already-shipped renderer; this is defensive polish. Update `inlineMarkdown.test.ts` L42-47. |

**Dropped from the diagnoses** (critique-confirmed phantom/regression work): header `items-start`/`self-center` churn (no squeeze exists — `min-h-14` has slack); persistent `bg-accent/70` question tick (reintroduces the rail it claims to remove); screener `bg-paper-sunken` chips (muddy on elevated paper); serif `text-2xl` goal standfirst (double-serif headline collision).

---

## 3. EXACT EDITS — TOP 3

### Change #1 + #2 — Layout (apply together)

**File:** `frontend/apps/app/src/app/[locale]/(app)/studies/new/page.tsx`

```
L552  BEFORE: <section className="col-span-5 border-r border-hairline flex flex-col bg-paper">
L552  AFTER:  <section className="col-span-4 border-r border-hairline flex flex-col bg-paper">

L612  BEFORE: <section className="col-span-7 flex flex-col overflow-hidden">
L612  AFTER:  <section className="col-span-8 flex flex-col overflow-hidden">

L690  BEFORE: <div className="max-w-2xl mx-auto">
L690  AFTER:  <div className="max-w-3xl mx-auto">
```

No header changes. Leave `min-h-14 py-2.5 flex items-center` (L613) exactly as-is — it has vertical slack, not a squeeze.

### Change #3 — Editorial chat bubbles (kills the black balloon)

**File:** `frontend/packages/ui/src/components/Chat.tsx`, the bubble `<div>` at **L332-340**.

```tsx
// BEFORE (L332-340)
      <div
        className={cn(
          "max-w-[80%] rounded-card px-4 py-3 text-[15px] leading-[1.5] whitespace-pre-wrap",
          isRespondent
            ? "bg-ink text-paper"
            : isSystem
              ? "bg-paper-sunken text-muted text-sm"
              : "bg-paper-elevated border border-hairline text-ink",
        )}
      >

// AFTER
      <div
        className={cn(
          "max-w-[80%] text-[15px] whitespace-pre-wrap",
          isRespondent
            // Researcher's reply — a quiet sunken-paper slip, not a black balloon.
            // No leading override: zh inherits body line-height 1.7, en gets 1.55.
            ? "rounded-card rounded-tr-sm bg-paper-sunken px-4 py-2.5 text-ink"
            : isSystem
              // System line — a centered, tracked whisper. text-body (5.26:1) not
              // text-muted (3.39:1) so it clears WCAG AA when it carries meaning.
              ? "px-2 py-1 text-center text-[11px] font-medium uppercase tracking-[0.12em] text-body"
              // Agent — borderless ink on paper with a hairline margin rail.
              : "border-l-2 border-hairline pl-4 pr-1 py-0.5 text-body",
        )}
      >
```

Key decisions (critique-driven, verified against `globals.css`):
- **`leading-[1.5]` removed entirely** — it was overriding the deliberate `html:lang(zh) body { line-height: 1.7 }` rule (globals.css:31-33). Each branch now inherits: en → 1.55, zh → 1.7. This is the single biggest a11y fix in the bubble change.
- **System line is `text-body` (#6B6660, 5.26:1)** not `text-muted` (#8A857F, 3.39:1 — fails AA). A system sentence carries meaning, so it must pass.
- **Agent branch `text-body` on paper = 5.26:1** (AA pass, verified — the diagnosis underestimated at 4.6).
- **Respondent `text-ink` on `bg-paper-sunken` ≈ 14.8:1** (AAA).
- **`ChatFeed` `gap-3` (L387) is NOT touched** — vertical rhythm belongs to the layout dimension; changing it here would collide.
- Clarify chips / TypingDots render outside/inside this div and reference no bubble background — untouched, still work.

### Change #4 — Hypothesis sage gutter

**File:** `frontend/apps/app/src/app/[locale]/(app)/studies/new/page.tsx`, **L717-728**. **Critical:** preserve the `d.key`/`d.badge`/`d.className` diff wrapper.

```tsx
// BEFORE (L717-728)
              <div key={d.key} className={`mt-6 ${d.className}`}>
                {d.badge}
                <p className="overline mb-2">{tc("hypotheses")}</p>
                <ul className="space-y-1.5">
                  {spec.hypotheses.map((h, i) => (
                    <li key={i} className="flex gap-3 text-body">
                      <span className="font-mono text-xs text-muted pt-0.5">H{i + 1}</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

// AFTER — sage serif markers in a true aligned gutter (diff wrapper preserved)
              <div key={d.key} className={`mt-6 ${d.className}`}>
                {d.badge}
                <p className="overline mb-3 flex items-center gap-2 before:h-px before:w-4 before:bg-hairline before:content-['']">
                  {tc("hypotheses")}
                </p>
                <ul className="space-y-3">
                  {spec.hypotheses.map((h, i) => (
                    <li key={i} className="grid grid-cols-[2rem_1fr] gap-3 text-body">
                      <span className="font-display text-base leading-tight text-accent">H{i + 1}</span>
                      <span className="leading-relaxed">{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
```

`H1/H2/H3` are literal latin glyphs (`H{i+1}`) even in zh, so the `2rem` track never clips. `text-accent` (#4A5D3B) on `bg-paper-elevated` ≈ 6.5:1 — AA. This same overline `before:` tick pattern applies to the other five section labels (Change #5).

---

## 4. ACCEPTANCE — SCREENSHOT-VERIFIABLE (en AND zh)

The after-screenshot must show, at **1280px and 1440px**, in **both `/en/studies/new` and `/zh/studies/new`**:

1. **Document dominant** — the elevated-paper discussion guide occupies ~two-thirds width; the chat rail is a visibly narrower ~one-third sidebar. The document, not the chat, is where the eye lands.
2. **Reading measure fills the pane** — document body text spans a comfortable ~768px column with margin, not a 672px column stranded in whitespace.
3. **No black balloon** — zero pure-black (`bg-ink`) message bubbles. Respondent replies are a soft warm sunken-paper slip (right-aligned); agent text is borderless with a thin hairline rule on its left; system lines are small centered tracked caps. Reads as marginalia, not iMessage.
4. **Hypotheses scannable** — `H1 · H2 · H3` render in **sage serif** (not faint grey mono), left-aligned in a consistent gutter column, each hypothesis text aligned off the same edge.
5. **Section rhythm** — each section overline (`HYPOTHESES`, `QUESTIONS`, etc.) is preceded by a short hairline tick, creating a scannable running-head cadence with visible breathing room above it.
6. **Questions airy** — question cards have generous padding (`p-5`), a numbered gutter (`01`, `02`), question in ink + goal in muted — no persistent green/sage bar on resting cards (a sage flash appears ONLY momentarily when a patch lands).
7. **No raw markers** — any agent line containing `**Methodology Insight**` (or zh `**价格锚点**`) shows the phrase in **bold weight with no literal `*` asterisks visible**. In zh the bold is not synthetically heavy (medium weight).
8. **Readiness spine legible** — the 4 pips (Decision·Audience·WhoPays·Depth / 决策·受众·谁付费·深度) sit on one row in the now-wider 8/12 header, no horizontal overflow or wrapping, in both locales.
9. **zh line-height intact** — Chinese document body and chat text retain the taller 1.7 line-height (no cramped 1.5/1.6 override); Chinese prose is not letter-spaced apart in body text.

**Verification files (all absolute):**
- `/Users/xiongxinwei/data/mine/cubxxw/personal/telepace/telepace-next/frontend/apps/app/src/app/[locale]/(app)/studies/new/page.tsx` (changes #1, #2, #4, #5, #6)
- `/Users/xiongxinwei/data/mine/cubxxw/personal/telepace/telepace-next/frontend/packages/ui/src/components/Chat.tsx` (change #3)
- `/Users/xiongxinwei/data/mine/cubxxw/personal/telepace/telepace-next/frontend/packages/ui/src/components/inlineMarkdown.tsx` (already shipped; optional #7 hardening)
- `/Users/xiongxinwei/data/mine/cubxxw/personal/telepace/telepace-next/frontend/apps/app/src/lib/inlineMarkdown.test.ts` (update only if #7 applied)

**Recommended landing order:** #1+#2 (one commit, QA spine) → #4+#5 (document typography, conflict-free) → #3 (bubbles) → #6 (question cards) → #7 (optional renderer hardening). Each commit is independently revertable.