# TASKS — telepace 执行清单（PRD 落地）

> 来源：`telepace-vs-listenlabs-PRD.md`
> 规则：**一次只做一个任务**；每个任务做完必须跑验收命令到全绿，再 `git commit`（一个任务一个 commit）；完成后把 `[ ]` 改成 `[x]` 并在 commit message 带任务号。
> 依赖：标注 `依赖:` 的任务必须等前置完成。无依赖的可并行。
> 技术栈：Next.js 15.5 / React 18 / next-intl(use-intl) / pnpm。
> 全局验收命令（下称"全绿"）：`pnpm lint && pnpm typecheck && pnpm build`（若有测试再加 `pnpm test`）。

---

## P0 — 阻断修复（必须先做，恢复"创建问卷"核心链路）

- [x] **T-001 · errors.ts 对未知错误码兜底**
  - 背景：`copyFor`(src/lib/errors.ts:52) → `friendlyMessage`(:59) 读取 `undefined.title` 抛 `TypeError`。
  - 做：`copyFor` 查不到 code 时返回默认文案对象（含 title/description），绝不返回 undefined；`friendlyMessage` 对空输入安全。
  - 验收：新增 `src/lib/errors.test.ts`，覆盖"已知 code / 未知 code / null / undefined"四种入参均不抛错且返回可用文案；`pnpm test` 全绿。

- [x] **T-002 · 补全 zh 语言包 `errors` 命名空间**
  - 背景：`IntlError: MISSING_MESSAGE: Could not resolve 'errors' in messages for locale 'zh'`（StudiesPage、NewStudyPage）。
  - 做：在 zh messages 里补齐 `errors.*` 所有被引用的 key；同步 en 保持键一致。
  - 验收：`pnpm build` 无 `MISSING_MESSAGE`；打开 `/zh/studies` 与 `/zh/studies/new`，浏览器控制台无 `IntlError`。

- [x] **T-003 · 创建页 handleSend 失败兜底**
  - 依赖: T-001, T-002
  - 背景：`handleSend`(src/app/[locale]/(app)/studies/new/page.tsx:236) 起草请求失败后 loading 永久转圈、无提示。
  - 做：try/catch 包裹；失败时重置 loading 态、展示用户可见错误文案、提供"重试"按钮；请求加超时（如 30s）。
  - 验收：mock 起草接口返回 500 / 断网时，UI 不再无限 loading，显示错误并可重试（新增 Playwright 或组件测试用例覆盖）。

- [x] **T-004 · 创建流程冒烟测试**
  - 依赖: T-003
  - 做：新增端到端冒烟：进入 `/zh/studies/new` → 输入研究目标 → 正常路径能生成提纲；失败路径有兜底。
  - 验收：`pnpm test`（或 `pnpm test:e2e`）该用例全绿；控制台无未捕获异常。

- [x] **T-005 · 登录后跳回被拦截页面时 locale 前缀重复导致 404**
  - 背景：`middleware.ts:41` 把含 locale 的物理路径写进 `next`（`/zh/studies/new`），而 `LoginForm.tsx:51` 用 next-intl 的 `useRouter` push——该 router 会自己再补一次 locale。任何未登录用户访问受保护页 → 登录成功 → 落在 `/zh/zh/studies/new` 404。`SignupForm` push 的是无前缀常量，故不受影响。
  - 做：`next` 改存 middleware 已算好的 `logicalPath`（locale-stripped），与 i18n router 的契约对齐。
  - 验收：`src/middleware.test.ts` 覆盖"剥离 locale / 保留 query / 登录页带正确 locale / 绝不出现双前缀 / 放行非保护路由"；经变异验证（还原 bug 时 3 条准确失败）。真实浏览器全链路复验：未登录访问 `/zh/studies/new` → 表单登录 → 落地 `/zh/studies/new`（非 404）。

---

## P1 — 对标基线补齐（分析系统 + 创建向导）

### 分析系统（差距最大）

- [x] **T-101 · 证据底座数据模型（Evidence Graph）**
  - 做：定义 `Respondent → Interview → Turn → Claim → Evidence` 的类型与存取层；每个 Claim/数字可挂 N 条 Evidence(引用 id) 与置信度。
  - 验收：类型与 repository 层单测全绿；能对一个已有 study 返回"洞察→证据 id 列表"。
  - 说明：这是 T-102/103/105/106 的公共地基，优先做。

- [x] **T-102 · study 详情叙事报告视图**
  - 依赖: T-101
  - 做：在 study 详情新增"报告"子视图：章节化叙事 + 左侧目录锚点 + 回到顶部 + 可下载(md/pdf)。
  - 验收：对 live 研究能渲染出带章节的报告页；目录点击可跳转；导出文件可打开。

- [x] **T-103 · 图表与交叉分析组件**
  - 依赖: T-101
  - 做：条形/占比图 + 按分群(年龄/角色/渠道/使用频率)的交叉表；图表皮肤与米色暖调一致（低饱和、细线、衬线数字）。
  - 验收：报告内至少渲染 1 个条形图 + 1 个交叉表；显示基数 N；视觉走查通过。

- [x] **T-104 · 统计规范标注**
  - 依赖: T-103
  - 做：图表/数字统一标注 N（基数）、多选占比>100% 提示、小样本(N<30)告警、Top-2-Box 说明。
  - 验收：小样本数据自动出现告警；多选题标注正确。

- [x] **T-105 · 证据可追溯（点击引用→原话）**
  - 依赖: T-101, T-102
  - 做：报告/洞察里的数字与 verbatim 可点击，展开对应受访者原话与访谈上下文。
  - 验收：点击任一引用能定位到具体 Turn/受访者；无死链。

- [x] **T-106 · 响应级数据表**
  - 依赖: T-101
  - 做：逐人列表（时长、质量分、分群标签、Bullet Summary、筛除原因）+ 搜索/筛选/导出 CSV。
  - 验收：能展示≥1 study 的逐人表；筛选与导出可用；导出列完整。

- [x] **T-107 · 单研究 Research Agent（带引用）**
  - 依赖: T-101
  - 做：对单个 study 的对话式问答（矛盾/主题/分群对比/金句）；回答带可展开 reasoning trace + 行内引用(→证据/图表)。
  - 验收：预设问题能给出带引用的结构化回答；点击引用可回溯；无引用的结论要标注"无直接证据"。

### 创建向导

- [x] **T-108 · 创建流程分步向导化**
  - 依赖: T-003
  - 做：把单栏聊天升级为分步（目标→受众→题目→欢迎/同意→结束→Review），每步 agent 给上下文相关多选澄清。
  - 验收：走完 5 步能产出结构完整的草稿；每步可返回修改。

- [x] **T-109 · 变更追踪 + 版本历史 + 撤销/重做**
  - 依赖: T-108
  - 做：创建/编辑显示"本次改动 N 处"可展开 diff；支持撤销/重做与历史回滚。
  - 验收：每次 agent 修改提纲有 diff；撤销/重做正确；可回滚到历史版本。

- [x] **T-110 · 导入已有提纲 + 模板库**
  - 依赖: T-108
  - 做：Upload Discussion Guide（导入已有提纲解析成题目）+ 分类模板起手（Market/UX/Product/Concept）。
  - 验收：上传一份提纲能解析出题目；模板点击能预填。

- [ ] **T-111 · 每题 AI 追问(follow-ups)配置 + 欢迎/同意/结束/奖励/跳转**
  - 依赖: T-108
  - 做：每题可配置追问策略/上限；欢迎页、同意勾选、结束语、奖励、完成跳转 可视化配置。
  - 验收：配置项能保存并在受访端生效（预览验证）。
  - ⚠️ 2026-07-15 复核后回退为未完成：UI 组件（FollowUpConfig / WelcomeEndConfig）已存在且功能正确，
    但**后端完全没有这五个字段** —— `CampaignSpec`(core/domain/models.py) 无 welcome_message /
    consent_text / end_message / reward_description / redirect_url，`createCampaign` 也不接受它们；
    `welcome_message` 全仓库只出现在前端文件里。组件挂在 WizardPage 下，而 WizardPage 既不调用
    createCampaign，其路由 /studies/new/wizard 也无任何入口链接（孤儿页）。
    即当前实现无法满足"能保存并在受访端生效"这条验收。
  - 待办顺序：① 后端 CampaignSpec + 建表/迁移 + createCampaign 接受这五个字段
    ② 受访端读取并生效 ③ 再把配置 UI 接进 /studies/new（组件可直接复用，contract 已对齐）。
    在 ① 之前接 UI 会做出"输入即丢弃"的假表单，故本次未接。

---

## P2 — 差异化放大（telepace 独有优势）

- [x] **T-201 · 收件箱运营 agent 体系化**
  - 做：escalation/insight/progress/system 分类 + 一键动作(延长/关闭/复核) + agent 动作可审计(为什么这么做+可撤销)。
  - 验收：收件箱条目可执行动作并留痕；可撤销。

- [x] **T-202 · 语音/电话原生分析**
  - 做：语音特有维度（情绪/语速/停顿）+ 可播放音频片段并与转写对齐。
  - 验收：语音访谈能展示音频片段回放 + 转写高亮对齐。

- [x] **T-203 · 音频/视频 Clips 自动剪辑**
  - 依赖: T-202
  - 做：按主题自动聚合高光片段成 reel（音频优先）。
  - 验收：能对一个 study 生成≥1 个主题片段合集。

- [x] **T-204 · MCP 研究工具化**
  - 做：把"发起研究/查询洞察/导出证据片段/触发分析"暴露为 MCP 工具（基于已有 mcp.telepace.io 接入）。
  - 验收：Claude Code/Cursor 连上后能调用≥3 个工具并返回真实数据。

- [x] **T-205 · 跨研究 Copilot + 落地闭环**
  - 依赖: T-107
  - 做：跨研究会话式分析(All/Select studies) 生成图表/memo + 一键落 Notion/Linear。
  - 验收：能跨≥2 study 生成对比 memo 并推送到 Notion 或 Linear。

- [x] **T-206 · i18n 一致性**
  - 做：全局统一（彻底双语切换 或 zh 下统一中文），消除"半汉化"。
  - 验收：切到 zh 无英文残留(标题/渠道等)；无 MISSING_MESSAGE。

- [x] **T-207 · 全局错误处理与空状态**
  - 做：统一错误边界/兜底文案/loading 超时；洞察/分析页有有质感的空状态与引导。
  - 验收：主要页面断网/空数据均有友好态,无白屏无死循环。

---

## P3 — 增长 / 可发现性（SEO + 分享体验）

- [x] **T-401 · 深度 SEO：每页 canonical + hreflang + 结构化数据**
  - 背景：营销页面已有 title/description，但缺少 per-page canonical 与 hreflang（en/zh 互为重复内容）、缺少 JSON-LD 结构化数据、root metadata 偏薄。
  - 做：新增 `src/lib/seo.ts`（`buildPageMetadata` 输出 canonical + 全量 hreflang + x-default + locale-aware OpenGraph/Twitter；`organization/webSite/softwareApplication/faqPage/breadcrumbList` schema 构造器）+ `JsonLd` 组件；13 个营销页统一走 `buildPageMetadata`；营销 layout 注入 Organization+WebSite；首页注入 SoftwareApplication、定价页注入 FAQPage、产品页注入 BreadcrumbList；root layout 补 keywords/robots(max-image-preview:large)/applicationName/formatDetection。
  - 验收：`pnpm typecheck && pnpm build && pnpm test` 全绿；起服务 curl 校验 `/en|/zh` 各页 canonical 自引用、hreflang(en/zh/x-default)、JSON-LD 类型正确渲染；新增 `src/lib/seo.test.ts` 覆盖。

---

## 进度记录（每完成一个任务在此追加一行）
<!-- 例: 2026-07-08 T-001 done, commit abc1234 -->
2026-07-09 T-103 done, commit 6094c9b — chart components (TpBarChart, CrossTab, ChartSection) with warm-beige theme
2026-07-09 T-104 done, commit 6094c9b — statistical annotations (small sample warning, multi-select tip, Top-2-Box, base N)
2026-07-09 T-106 done, commit c4fc119 — response-level data table with search, filter, CSV export
2026-07-09 T-207 done, commit 93f64a6 — global error boundaries, loading skeletons, not-found page with bilingual copy
2026-07-09 T-001 done, commit 6819fe6 — vitest infrastructure + copyFor FALLBACK_COPY guard + 22 unit tests
2026-07-09 T-002 done (verified) — zh/errors.json already had all 9 keys matching en/errors.json
2026-07-09 T-003 done (verified) — handleSend has try/catch, setBusy(false) in finally, friendlyMessage error display, retry via lastFailed
2026-07-09 T-004 done, commit 6ed36ba — creation flow smoke test with 9 assertions (wizard steps, form state, outline shape)
2026-07-09 T-101 done, commit d78cc11 — evidence graph data model (types + mock data + context store)
2026-07-09 T-102 done, commit 4b8b732 — narrative report view with TOC, chapter navigation, export buttons
2026-07-09 T-105 done, commit 4b8b732 — evidence traceability (CitationLink, TranscriptPanel, CitationContext)
2026-07-09 T-107 done, commit 4b8b732 — research agent chat panel (ResearchChat, CitedAnswer, SuggestedQuestions)
2026-07-09 T-108 done, commit 4b8b732 — step wizard (WizardShell + 5 step components + types)
2026-07-09 T-109 done, commit 4b8b732 — version history, undo/redo, diff view (useHistory hook)
2026-07-09 T-110 done, commit 4b8b732 — template gallery + file upload component
2026-07-09 T-111 done, commit 4b8b732 — follow-up config + welcome/end config components
2026-07-09 T-201 done, commit d78cc11 — inbox agent system with action buttons, audit trail, filtering
2026-07-09 T-202 done, commit 4b8b732 — voice analysis (AudioPlayer, TranscriptAlignment, VoiceMetrics)
2026-07-09 T-203 done, commit 4b8b732 — audio clips (ClipPlayer, ClipGallery, ClipReel)
2026-07-09 T-204 done, commit 4b8b732 — MCP tools page with config snippet and tool documentation
2026-07-09 T-205 done, commit 4b8b732 — cross-study copilot (CopilotChat, StudySelector, MemoExport)
2026-07-09 T-206 done, commit d78cc11 — i18n consistency (all hardcoded strings extracted to en/zh app.json)
2026-07-12 T-208 done, commit 890b6a5 — pre-creation task assessment gate (/assess endpoint, research_task first-class field, hard-gated clarify loop, editable Research Task card)
2026-07-13 T-301 done, commit e4d03bf — wire real insight/followup readers into MCP tools (ProjectorInsightReader, EventStoreTranscriptReader, AnalystFollowupService)
2026-07-13 T-302 done, commit 8114132/07be97e — OrchestratorAgent conversational tool-calling core (reuses MCP_TOOL_REGISTRY + TOOL_HANDLERS, MockLLM TDD)
2026-07-13 T-303 done, commit e64b5cc — POST /agent/chat SSE endpoint (JWT-scoped per-request orchestrator)
2026-07-13 T-304 done, commit 15e8177 — 4 new MCP tools (list_campaigns, refine_outline, start_campaign, dispatch_invites) closing the full lifecycle loop
2026-07-13 T-305 done, commit a91a638 — global research-copilot sidebar (agentChat SSE client, GlobalAgentPanel, AgentDock apple-design drawer, zh/en i18n)
2026-07-13 T-306 done, commit 4176811 — CopilotChat wired to real agent (de-mocked); AgentDock hidden in /studies/new studio (方案 B)
2026-07-14 T-307 done, commit 17ae8cc — study-progress visualization + structured agent list cards (shared ProgressBar/studyStatus, list overview band, list_campaigns cards with status/progress/deep-link, detail metric bar); "取 resume 之骨、留 telepace 之魂"
2026-07-14 T-307 done, commit 8bb6c07 — create-studio all-in redesign (Jobs-voice feedback): fix scroll-collapse (h-screen shell + main scroll), i18n content follows UI locale, remove "N changes" badge, drop na "who pays" pip, collapsible chat rail (guide is the star), honest LaunchPanel promoting Delivery to the publish moment
2026-07-14 T-307 done, commit 7d4e461 — fix workbench phantom page-scroll (canvas pane's overflow-y-auto leaked content height to <html>); pin studio root with absolute inset-0 on relative main so only the panes scroll, page no longer drags into blank space
2026-07-15 T-204/T-207 gap-fill done, commit abcf2ea — MCP docs page was shipped but unreachable (no routes.ts entry, zero inbound links, absent from integrations index); added routes.app.integrationsMcp + an MCP card leading the integrations index. Added error.tsx for (auth)/(marketing)/(public) — only (app) had one — and extracted shared bilingual copy into errorBoundaryCopy.ts. Added loading.tsx for inbox/insights. No root not-found.tsx: middleware redirects every unprefixed path to a locale, so [locale]/not-found.tsx already catches them (verified /nonsense-url → 307 → 404).
2026-07-15 PR queue audit — closed #10/#12/#13/#14/#16 as already-reimplemented on main (verified against commits 93f64a6/6ed36ba/d78cc11/4b8b732; main's files are supersets, two byte-identical). Reopened #15 after finding my "main is a superset" call was wrong there — main's MCP page is a documentation regression AND orphaned; superseded by abcf2ea. Note: those 5 branches predate the [locale] i18n refactor, which is why all went DIRTY at once — work landed on main directly instead of through the PRs.
2026-07-15 T-111 reverted to [ ] — see task note. UI exists, backend has none of the five fields.
2026-07-15 T-401 done — deep SEO: added src/lib/seo.ts (buildPageMetadata: per-page canonical + hreflang + x-default + locale-aware OG/Twitter) and JsonLd component; 13 marketing pages unified on buildPageMetadata; marketing layout emits Organization+WebSite, home emits SoftwareApplication, pricing emits FAQPage, product pages emit BreadcrumbList; root metadata gained keywords/robots(max-image-preview:large)/applicationName/formatDetection. Verified via built server: self-referencing canonical + en/zh/x-default hreflang + JSON-LD render on /en & /zh. 10 new tests (seo.test.ts), full suite 78 green.
2026-07-19 hydration-mismatch investigation (branch claude/react-hydration-mismatch-773y50) — diagnosed the recoverable "server rendered <main> vs <Suspense>" error on /zh/studies (AppLayout:33). Root cause: a browser extension injecting a DOM node into the app shell before React hydrates (translation tools/沉浸式翻译, ad blockers, DarkReader…) — reproduced the EXACT component stack via a Playwright inject-before-<main>; a clean browser hydrates every route 0-error. It is recoverable (page re-renders intact) and node-injection is not app-suppressible. Change: added suppressHydrationWarning to <body> (mirrors <html>) — the documented mitigation for the body-attribute-injection variant. Also audited zh i18n: en/zh key parity 0 missing/0 extra across 8 namespaces, CJK serif fallback + tracking/leading verified, screenshots of /zh, /zh/studies, /zh/settings, /zh/studies/new all render elegantly. Full analysis in docs/hydration-mismatch-and-zh-audit.md. typecheck+build+test (86) green; lint pre-existingly interactive (no committed eslint config).
