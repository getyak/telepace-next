# Hydration mismatch on `/zh/studies` — root-cause analysis & zh i18n audit

Branch: `claude/react-hydration-mismatch-773y50`

## The report

```
Hydration failed because the server rendered HTML didn't match the client.
As a result this tree will be regenerated on the client.
...
+  <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
-  <Suspense>
...
  at AppLayout (src/app/[locale]/(app)/layout.tsx:33:11)
```

Type: **Recoverable Error** (React discards the server HTML for that subtree and
re-renders it on the client; the page keeps working afterwards).

## TL;DR

- **The app has no hydration bug.** A clean browser hydrates `/zh/studies` (and
  every other app + marketing route) with **zero** hydration errors, repeatedly.
- The reported error is caused by a **browser extension injecting a DOM node into
  the app shell before React hydrates** — the near-universal situation for
  Chinese users (translation extensions like 沉浸式翻译 / Immersive Translate,
  ad blockers, DarkReader, password managers, coupon helpers…).
- It is **recoverable**: React regenerates the shell subtree and the page renders
  correctly (sidebar, `<main>`, headings all intact after recovery).
- **No app-code change can suppress an injected child/sibling node** —
  `suppressHydrationWarning` only forgives an element's *own* attributes/text, not
  structural child differences. This was verified empirically (below).
- The zh i18n is **complete and well-designed**: full en/zh key parity across all
  8 namespaces, a proper CJK serif fallback chain, and CJK-aware tracking/leading.

## How it was reproduced

Ran the dev server (`next dev --turbopack`, Next 15.5.20 — same as the report) and
drove it with Playwright + the pre-installed Chromium, seeding a `tp_access` cookie
so the shell renders as a signed-in session (`initialHasSession={true}`, matching
the report).

1. **Clean baseline** — no mismatch anywhere:
   - `/zh/studies` diffed byte-for-byte: server `<main>…</main>` == client
     `<main>…</main>`.
   - 6× repeated cold loads of `/zh/studies`: **0/6** hydration errors.
   - Swept 11 routes (`studies, inbox, audience, insights, copilot, integrations,
     settings, studies/new, /zh, pricing, login`): **0** hydration errors, **0**
     React warnings.

2. **Extension simulation** — inject a `<div>` as a sibling *before* `<main>` in
   the shell flex container, before hydration:

   ```js
   page.addInitScript(() => {
     const inject = () => {
       const main = document.querySelector('main');
       if (main?.parentElement && !main.parentElement.dataset.x) {
         const n = document.createElement('div');   // ad/translation overlay
         main.parentElement.insertBefore(n, main);   // sibling BEFORE <main>
         main.parentElement.dataset.x = '1';
       }
     };
     const iv = setInterval(inject, 3); setTimeout(() => clearInterval(iv), 1500);
   });
   ```

   This reproduces the reported error **exactly** — identical component stack:
   `InnerLayoutRouter url="/zh/studies"` → `SegmentViewNode type="layout"` → the
   four injected `<script>` nodes → `<AppLayout>` → `+<main>` / `-<Suspense>`
   (the `<Suspense>` is the shifted `loading.tsx` boundary that normally sits
   first inside `<main>`).

3. **After recovery the page is intact**: `{ sidebar: true, main: true,
   h1: "今天我们要研究什么？", mainChildren: 1 }`.

## What does and doesn't trigger it (React 18.3 / Next 15.5.20)

| Extension behaviour                                   | Hydration error? |
| ----------------------------------------------------- | ---------------- |
| Attribute on `<html>` (e.g. `translated-ltr`)         | No               |
| Attribute / `class` / inline `style` on `<body>`      | No               |
| Injected **child node** into `<main>`                 | **Yes**          |
| Injected **sibling node** before `<main>` (the shell) | **Yes** (== report) |

Takeaway: this React/Next version already tolerates attribute-level extension
drift; only **structural node injection** into React's controlled tree trips it,
and that is inherently recoverable-only.

## The change in this PR

`frontend/apps/app/src/app/layout.tsx` — add `suppressHydrationWarning` to
`<body>`, mirroring the guard already on `<html>`. This is the mitigation
Next.js documents for "a browser extension … messes with the HTML" (the error's
own wording). Scope, stated honestly:

- **Covers**: `<body>`'s own attribute drift (Grammarly `data-gr-*`, DarkReader,
  ColorZilla `cz-shortcut-listen`, LanguageTool `data-lt-*`, 1Password…) — the
  most common extension behaviour, and future React/extension combos that flag it.
- **Cannot cover**: injected child/sibling *nodes* (the specific reported case).
  There is no app-side suppression for that; React 18 downgrades it to a
  recoverable error and re-renders, which is the graceful path we already get.

No functional change; verified the clean sweep still passes after the edit.

### Investigated and cleared

- `AgentDock` uses `next/dynamic(() => import('./GlobalAgentPanel'), { ssr: false })`
  (added in `84cb761`, just before this branch — a natural suspect). It is gated on
  `{open && …}` (`open` starts `false`), so the lazy/Suspense boundary is **not**
  in the first-paint tree; it cannot cause the initial mismatch. Confirmed by the
  clean SSR/hydration diff.
- `useRelativeTime` (`Date.now()`) and other client-only, post-fetch render paths
  never run during SSR, so they can't mismatch on first paint.

## zh i18n audit

Requested: "确保中文的页面有正常优雅的显示 … 确保中文页面的配置都是良好的，都设计到位的".

- **Message parity**: `en` vs `zh` across `common, nav, marketing, app, auth,
  respondent, errors, metadata` → **0 missing, 0 extra** keys. Remaining
  `zh == en` values are correctly-preserved proper nouns / tech terms / format
  placeholders (`MCP`, `REST API`, `Claude Desktop`, `{completed} / {target}`, …).
- **CJK typography** (`packages/ui/src/globals.css`): `html:lang(zh)` gets a real
  serif fallback chain (self-hosted `Noto Serif SC` via `next/font`, then
  `Songti SC` / `Source Han Serif SC`), CJK-appropriate `line-height` (1.7 body /
  1.2 display) and `letter-spacing: 0` (the latin negative tracking is unlayered-
  overridden so full-width glyphs never inherit it).
- **Font loading**: `Noto_Serif_SC` is `preload: false`, so latin visitors pay
  nothing and zh visitors fetch only the unicode-range slices a page uses.
- **Visual check** (screenshots): `/zh` home, `/zh/studies`, `/zh/settings`,
  `/zh/studies/new` all render elegantly — serif headings ("今天我们要研究什么？",
  "工作区偏好设置。", "理解用户 真正想要什么，以及原因。"), correct nav labels,
  no clipped text, no English leakage.

Conclusion: the zh configuration is already in good shape; no message or config
changes were required.

## Reproduction harness

The Playwright scripts used above are throwaway (not committed). To re-run:
seed a `tp_access` cookie, `page.addInitScript` the injection above, and listen on
`page.on('pageerror', …)` for `Hydration failed`.
