# telepace 前端整合与 UI/UX 优化执行方案

> **文档目的**：本文档是一份可直接交给 AI 编码代理执行的改造说明书。每个任务都标注了
> 优先级、涉及文件、现状、目标行为、验收标准。执行时按 Phase 顺序推进，Phase 内的
> 任务可并行。所有代码注释用英文，遵循仓库现有代码风格。
>
> **设计北极星**：保持并强化 `docs/design-system.md` 定义的 editorial / quiet-luxury
> 审美（参考 anthropic.com、mercury.com、listenlabs.ai），同时补上一个 voice-native
> 产品应有的"声音感"视觉语言。**不要**引入 shadcn 默认风格、渐变紫、玻璃拟态等
> 与现有 token 冲突的元素。

## 执行状态（持续更新）

- **Phase 1.1 应用合并** ✅ 已完成：`apps/marketing` / `apps/app` / `apps/respondent` 已合并为单一
  `apps/app`（`(marketing)/(auth)/(app)/(public)` route groups），`routes.app.root` 改为 `/studies`，
  dev/build 端口统一 3000，`pnpm build`/`pnpm typecheck` 通过。URL hash 跨应用传 token（A1）随之消失
  （合并后登录页直接调用 `useAuth().login()`，无需跨源跳转）。
- **Phase 1.2 httpOnly cookie 认证** ⏳ 未完成：`tokenStore` 仍用 localStorage（A3 仍在）。这一步需要
  新增 BFF route handlers 代理全部后端调用（不只是 auth），依赖后端 CORS/cookie 域名配置，**必须先与
  后端联调验证**才能安全上线，本轮未改动，避免在无法端到端测试的情况下破坏登录能力。
- **Phase 2.1/2.3 统一登录/注册页** ✅ 已完成：共享 `AuthCard` 组件（`components/auth/AuthCard.tsx`），
  两页视觉与错误处理同源。
- **Phase 2.2 Google OAuth** ✅ UI 占位已完成：`components/auth/OAuthButtons.tsx`，
  由 `NEXT_PUBLIC_OAUTH_GOOGLE`（默认 false）控制显隐；后端 `/auth/oauth/google` 流程未实现。
- **Phase 3 / 4 / 5**：绝大部分已在此前的 PR 中完成（移动端导航、Hero voice 效果、next/font、
  SEO/metadata、Button 变体、Sidebar active 态、UI 组件补全、CI token 守护脚本、design-system.md 补充）。
  剩余已知小项：营销/安全页上的 "SOC 2" 相关文案是真实的路线图声明（非虚构背书），未改动。
- **持续打磨 Pass**（本轮）：修复了与计划漂移的若干细节——sidebar/nav 图标与 hamburger/close
  SVG 去重到 `@telepace/ui` 的 icons 集合；`studies/new` 剩余的 loading 三元表达式换成 `Button`
  的 `loading` prop；`integrations` 页接入共享 `PageHeader`/`EmptyState`；受访者页（`/r/[id]`）
  的麦克风权限/语音 WS 报错从静默 `console.error` 改为 `toast.error` 提示，并换用共享 `Button`；
  `/demo` 拆分出 server component 以获得独立 metadata（原为纯 client 组件，无 metadata）；
  修正首页与 `/customers` 相邻同底色分区、统一两处 final-CTA 文案、careers mailto 主题做
  `encodeURIComponent`。四项检查（typecheck / check:colors / check:tokens / build）均通过。
- **已知遗留，留待下一轮决策**（非 bug，需要产品/视觉决策或无法离线验证）：
  1. `packages/ui` 的 `Card`/`CardHeader`/`CardBody`/`CardFooter` 在 `apps/app` 中零使用，
     18+ 处手写了等价的 `rounded-card border border-hairline bg-paper-elevated p-…`；
  2. `UserMenu` 自实现了开合/点击外部关闭/Esc 逻辑，未复用 `DropdownMenu`——因为 `UserMenu`
     需要向上展开、占满侧栏宽度，而共享组件目前只支持向下展开 + 固定 `min-w-[180px]`；
  3. `apps/app/src/lib/errors.ts` 与 `ToastBridge` 的错误文案是中文，与站点其余英文 UI 不一致，
     但注释表明是有意为之的本地化模块，需要产品决策而非顺手改掉；
  4. Phase 5.3 的 Playwright 截图基线（`docs/design/baselines/`）仍未建立，需要一个可运行的
     dev server 环境。

---

## 0. 现状审计摘要（改动依据）

### 0.1 仓库结构

```
frontend/
├── apps/
│   ├── marketing/   # 官网，port 3300，18 个 ts/tsx 文件（含 login/signup）
│   ├── app/         # 主应用，port 3001，18 个文件（又一份 login）
│   └── respondent/  # 受访者问卷页，port 3002，仅 3 个文件（/r/[campaignId]）
└── packages/
    ├── config/      # endpoints.ts / routes.ts / env.ts / site.ts / auth-schema.ts …
    ├── ui/          # tokens.ts / globals.css / Button / Card / Chat / Field
    ├── icons/
    └── protocols/
```

三个应用技术栈完全一致（Next.js 15 App Router + React 18 + Tailwind 3），
共享 `@telepace/config` 与 `@telepace/ui`，无应用独有第三方依赖。

### 0.2 已确认的问题清单

| # | 问题 | 位置 | 严重度 |
|---|------|------|--------|
| A1 | 登录 token 通过 URL hash 跨应用（3000→3001）传递 | `apps/marketing/src/app/login/page.tsx:29-34` | **高** |
| A2 | 登录页实现了两份，视觉/文案/错误处理均不一致 | `apps/marketing/src/app/login/page.tsx` vs `apps/app/src/app/login/page.tsx` | **高** |
| A3 | token 存 localStorage（`tokenStore`），XSS 可窃取 | `apps/app/src/lib/auth/store.ts` | **高** |
| A4 | 无 OAuth / SSO / magic link，仅邮箱密码 | 全部 auth 相关 | 中 |
| A5 | marketing 登录错误用 `text-red-600`（脱离 token 体系，danger 应为 `#A83A2F`） | `apps/marketing/src/app/login/page.tsx:88` | 低 |
| B1 | TrustBar 展示虚构客户 logo（"Vercel Studio"、"Stripe Design"、"Pentagram"） | `apps/marketing/src/app/page.tsx:75-89` | **高**（法律/信任风险） |
| B2 | 移动端完全没有导航入口（`hidden md:flex`，无汉堡菜单） | `apps/marketing/src/components/site-chrome.tsx:12` | **高** |
| B3 | Hero 的对话 mock 是纯静态，voice-native 卖点无任何声音/动效表达 | `apps/marketing/src/app/page.tsx:51-69` | 中 |
| B4 | 字体通过 Google Fonts `<link>` 加载，非 `next/font`，有 FOUT 与合规问题 | `apps/app/src/app/layout.tsx:16-21`（marketing 同） | 中 |
| B5 | 页面 metadata 只有 title，无 description / OG image / favicon 体系 | 各 layout.tsx | 中 |
| B6 | Footer 声称 "SOC 2 Type II in progress"，若非事实需移除 | `site-chrome.tsx:64` | 中 |
| C1 | 应用侧边栏无 active 高亮、无图标 | `apps/app/src/app/layout.tsx:51-60` | 中 |
| C2 | 应用移动端侧边栏直接消失，无替代导航 | `apps/app/src/app/layout.tsx:26` | **高** |
| C3 | UI 包只有 4 个组件文件；Toast 在 app 内自实现未下沉；缺 Dialog/Dropdown/Skeleton/EmptyState/Badge | `packages/ui/src/components/` | 中 |
| C4 | Button 无 `loading` prop，各页面手写 "Signing in..." | `packages/ui/src/components/Button.tsx` | 低 |
| C5 | app 登录页用 `useSearchParams` 无 `<Suspense>` 边界（Next 15 build 会 CSR bailout 警告） | `apps/app/src/app/login/page.tsx:14` | 低 |

### 0.3 设计 token（唯一来源，保持不变）

规范见 `docs/design-system.md`，实现见 `frontend/packages/ui/src/tokens.ts`。
核心：`paper #F8F6F1` / `ink #141414` / `accent #4A5D3B`（鼠尾草绿）/
`terracotta #B45A3C` / 衬线标题 `Instrument Serif` / 正文 `Inter`。
**任何新 UI 禁止使用 Tailwind 默认色板（如 `red-600`、`blue-500`），必须走 token。**

---

## Phase 1（P0）：应用合并 + 认证架构重构

> 这是后续一切设计工作的地基。先做架构，再做皮肤。

### 1.1 合并三个应用为单一 Next.js 应用

**目标结构**（在 `frontend/apps/app` 基础上合并，最后可重命名为 `web`）：

```
apps/app/src/app/
├── (marketing)/            # 官网 route group：Nav + Footer 布局
│   ├── layout.tsx          # 移入 site-chrome 的 Nav/Footer
│   ├── page.tsx            # 首页（原 marketing/page.tsx）
│   ├── pricing/ docs/ mcp/ product/ customers/ changelog/
│   ├── careers/ security/ privacy/ terms/ demo/
├── (auth)/                 # 无导航的极简布局
│   ├── layout.tsx
│   ├── login/page.tsx      # 唯一的登录页（见 Phase 2）
│   └── signup/page.tsx
├── (app)/                  # 应用布局：Sidebar + AuthProvider 守卫
│   ├── layout.tsx
│   ├── studies/ inbox/ audience/ insights/ integrations/ settings/
├── (public)/
│   └── r/[campaignId]/     # 受访者页（原 respondent），独立极简布局
└── layout.tsx              # 仅 html/body + 字体 + Toaster
```

**执行要点**：

1. 根 `layout.tsx` 只保留 `<html>`、字体加载（改用 `next/font`，见 3.4）、
   全局 CSS；`AuthProvider` 下沉到 `(app)/layout.tsx`，营销页不需要它。
2. 迁移页面时逐个文件移动，import 路径从 `@/components/site-chrome`
   改为新位置；`site-chrome.tsx` 移到 `apps/app/src/components/marketing/`。
3. 删除 `apps/marketing` 与 `apps/respondent` 目录；
   `pnpm-workspace.yaml` 无需改（glob 自动收敛）。
4. `packages/config/src/env.ts`：删除 `appUrl`（`NEXT_PUBLIC_APP_URL`）——
   合并后不存在跨应用跳转。
5. `routes.ts` 不需要大改（它本来就按单站点建模），只把 `app.root`
   从 `/` 改为 `/studies`（营销首页占用 `/`），并全局搜索替换引用。
6. dev 端口统一为 3300；更新 README / deploy 配置里的端口引用。

**验收**：`pnpm dev` 只起一个 server；`/`、`/pricing`、`/login`、`/studies`、
`/r/test-id` 均可访问且布局正确；`pnpm build` 与 `pnpm typecheck` 通过；
仓库中搜索 `NEXT_PUBLIC_APP_URL`、`env.appUrl` 零结果。

### 1.2 认证改为 httpOnly cookie（消灭 A1/A3）

**现状**：marketing 登录后把 `access_token`/`refresh_token` 拼进 URL hash 跳到
app；app 端 `tokenStore` 存 localStorage。

**目标**（对标 Linear/Vercel 的会话模型）：

1. 新增 Next.js Route Handlers 作为 BFF 薄层：
   - `app/api/auth/login/route.ts`：代理后端 `/auth/login`，把返回的
     token 写入 **httpOnly + Secure + SameSite=Lax** cookie
     （`tp_access` 短效、`tp_refresh` 长效，path 限定）。
   - `app/api/auth/logout/route.ts`、`app/api/auth/refresh/route.ts` 同理。
2. `apps/app/src/lib/http.ts` 改为同源请求 `/api/...`（或保留直连后端但
   凭证走 cookie —— 取决于后端 CORS；优先 BFF 代理，最简单）。
3. 新增 `middleware.ts`：匹配 `(app)` 段路由，无 `tp_access` cookie 时
   redirect 到 `/login?next=<pathname>`。
4. 删除：`apps/marketing/src/lib/auth-fetch.ts`（随合并消失）、
   `apps/app/src/lib/auth/store.ts` 的 localStorage token 读写（非敏感的
   user 显示信息缓存可保留）、所有 URL hash 解析逻辑。
5. `AuthProvider` 保留 context 形态（`status/user/login/logout`），
   内部改调 BFF。

**验收**：DevTools 中 Application → Local Storage 无任何 token；
登录后 cookie 为 httpOnly；未登录直接访问 `/studies` 被重定向到
`/login?next=/studies`；登录成功回跳 `next`。

---

## Phase 2（P0-P1）：登录/注册体验重设计

> 参考基准：**Linear**（极简单列、登录方式优先级清晰）、**Notion**（SSO 置顶、
> 邮箱次之）、**Vercel**（"Last used" 记忆标签)、**Stripe Dashboard**
> （错误内联、可恢复）。只借鉴结构与行为，皮肤严格执行 telepace 自己的 token。

### 2.1 统一登录页（替换现有两份）

**位置**：`(auth)/login/page.tsx` + 共享组件 `(auth)/_components/AuthCard.tsx`。

**布局规范**（单列居中，Linear 式）：

- 视口垂直水平居中，卡片 `max-w-[400px]`，`bg-paper-elevated`、
  `border-hairline`、`rounded-card`、`p-8`。
- 卡片上方居中：品牌 wordmark（`font-display text-2xl`，链接回 `/`）。
- 标题：`font-display text-3xl` — "Welcome back."（登录）/
  "Create your account."（注册）。**全站统一用 "Sign in" 措辞**，
  禁用 "Log in"（现状两页不一致）。
- 页面背景：`bg-paper`，可加一层极淡的 `paper-sunken` 径向渐晕
  （opacity ≤ 0.4）；不要网格线、不要光斑。

**表单行为规范**：

1. 字段顺序：Email → Password。Label 用 `Label` 组件；
   "Forgot?" 链接右对齐在 Password label 行，`text-muted hover:text-ink`。
2. 错误展示：单条内联错误，`text-danger`（token 色 `#A83A2F`，
   确认 tailwind 配置暴露了 `danger`），带 `role="alert"`；
   401 时文案 "Email or password is incorrect."（沿用 app 版逻辑，
   它是两版中更好的那份）。**删除 marketing 版的 `text-red-600` 列表式错误。**
3. 提交按钮：`Button` 全宽，使用新的 `loading` prop（见 4.2），
   loading 时文案 "Signing in…"。
4. 用 `<Suspense>` 包住使用 `useSearchParams` 的部分（修复 C5）。
5. 底部："New to telepace? **Create an account**"（`text-ink hover:underline`）。

### 2.2 登录方式扩展（P1，与后端排期协调）

按此优先级逐步加入，UI 先只实现 Google 一项：

1. **Google OAuth**（B2B 标配）：Email 表单上方放
   "Continue with Google" secondary 按钮 + "or" 分隔线
   （hairline + 居中小字 `text-muted text-xs uppercase tracking-widest`）。
   后端需加 `/auth/oauth/google` 流程；前端按钮先做好，
   未配置时用 feature flag 隐藏（`env.ts` 增加 `NEXT_PUBLIC_OAUTH_GOOGLE`，
   默认 false）。
2. **Magic link / email code**（Notion/Linear 式无密码）：二期，
   `/auth/otp/request` + 6 位码输入组件。
3. **"Last used" 记忆**（Vercel 式）：localStorage 存**登录方式名**
   （非敏感），下次访问在对应按钮右上角显示 `Last used` pill
   （`bg-accent-soft text-accent text-[10px] rounded-pill px-2`）。
4. Passkey 留到有真实用户后再评估。

### 2.3 注册页与登录页共享骨架

`signup/page.tsx` 复用 `AuthCard`，仅多 `display_name`（可选）字段与
服务条款一行小字："By continuing you agree to the **Terms** and
**Privacy Policy**."（链接 `routes.terms` / `routes.privacy`）。

**验收**：登录/注册两页视觉完全同源；仓库无 `text-red-600`；
375px 宽度下卡片留边 ≥ 24px 且无横向滚动；
键盘 Tab 顺序 email → password → forgot → submit；
`prefers-reduced-motion` 下无动画。

---

## Phase 3（P1）：官网（marketing）优化

### 3.1 立即删除虚构信任背书（B1、B6）

- 删除 `TrustBar` 中的假 logo 列表（"Radicle"、"Northstar"、"Pentagram"、
  "Vercel Studio"、"Stripe Design"）。替换为**真实可验证的量化条**：
  一行三个指标（如 "5 channels · one interview"、"< 60s to launch a study"、
  "MCP · Skill · REST"），沿用 `overline` + `font-display` 排版。
  有真实客户后再恢复 logo 墙。
- Footer 的 "SOC 2 Type II in progress" 若无真实审计进行中即删除，
  只留 "Made in the open."。

### 3.2 移动端导航（B2）

`site-chrome.tsx` 的 `Nav` 增加移动端菜单：

- md 以下显示汉堡按钮（放入 `@telepace/icons`；图标用两条细线的
  极简样式，`stroke-width: 1.5`，与 editorial 风格一致——不要三条粗线）。
- 展开为**全屏覆盖层**（`bg-paper`，非侧滑抽屉）：大号 `font-display text-3xl`
  纵向链接列表 + 底部 "Sign in / Start free"。参考 anthropic.com 移动菜单。
- 打开时锁 body 滚动；`Esc` 与路由变化时关闭；`aria-expanded` 正确。

### 3.3 Hero 增加 "voice" 的感官表达（B3）

现有右侧对话 mock 保留结构，做三处升级（全部尊重
`prefers-reduced-motion`，降级为静态）：

1. **对话逐条淡入**：三条消息以 600ms 间隔 `opacity + translateY(4px)`
   进入，播完一轮后停住（不要无限循环打字机，会显廉价）。
2. **live 指示点**：现有绿点加自定义 2.4s 缓速脉冲
   （不用 Tailwind 默认 `animate-pulse` 的 1s——太急促）。
3. **语音波形条**：在受访者深色气泡底部加一行 5-7 根竖条波形
   （`bg-paper/50`，高度用 CSS keyframes 错峰起伏，2-3s 周期）。
   这是全站唯一常驻动效——克制即高级（呼应 design-system.md 的
   "No parallax. No gradient blobs."）。

实现放 `components/marketing/HeroConversation.tsx`（client component），
Hero 其余部分保持 server component。

### 3.4 字体改用 next/font（B4）

根 layout 移除 Google Fonts `<link>`，改为：

```ts
import { Inter, Instrument_Serif } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const serif = Instrument_Serif({ weight: "400", subsets: ["latin"], variable: "--font-display" });
```

`globals.css` 与 `tokens.ts` 的 font-family 首位换成对应 CSS 变量。
消除 FOUT，并让 `(public)` 受访者页也统一获得字体。

### 3.5 Metadata / SEO 体系（B5）

- 根 layout：`metadata` 增加 `description`（用 `siteConfig.brand.tagline`）、
  `metadataBase`（`siteConfig.urls.home`）、`openGraph`、`twitter` 卡片。
- 每个营销页导出各自 `title` / `description`（模板 `%s · telepace`）。
- 新增 `app/opengraph-image.tsx`（Next OG 生成）：paper 底色 + 衬线大字
  tagline + 右下角小 waveform 图形，配色走 token。
- 新增 `app/icon.svg`（字母 t 的极简 wordmark 或 waveform 符号）、
  `app/sitemap.ts`、`app/robots.ts`。

### 3.6 排版细节打磨（低成本高感知）

- `FinalCTA` 深色区的按钮目前靠 `className` 覆盖 hack —— 给 `Button`
  增加 `variant="inverse"`（`bg-paper text-ink hover:bg-paper-elevated`）
  与 `variant="inverse-outline"`，替换现有覆盖写法。
- 全站 CTA 文案统一："Start free"（主）/ "Try a live 60-sec interview →"（次）。
  现状混用 "Try for free" / "Start free"。
- 区块底色节奏：保持 `bg-paper` / `bg-paper-elevated` 交替 +
  `border-hairline` 分隔，检查全部营销页遵守。
- 行宽约束：正文段落 ≤ 65ch（`max-w-prose`），标题 `max-w-3xl`。

---

## Phase 4（P1-P2）：应用界面（dashboard）优化

> 参考基准：**Linear**（侧栏密度与 active 态）、**Mercury**
> （editorial 风格进 dashboard 的最佳范例，与 telepace token 最同源）、
> **Notion**（空状态文案质量）。

### 4.1 侧边栏（C1/C2）

`(app)/layout.tsx` 的侧栏抽成 `components/app/Sidebar.tsx`（client）：

1. **Active 态**：`usePathname()` 前缀匹配；active 项
   `bg-paper text-ink font-medium` + 左侧 2px `bg-accent` 指示条
   （`rounded-pill`）。hover 保持现有样式。
2. **图标**：每项配 16px 线性图标（`stroke-width: 1.5`，放进
   `@telepace/icons`——不要引 lucide 整包，按需内联单个 SVG）。
   图标 `text-muted`，active 时 `text-accent`。
3. **分组**：`Studies / Inbox / Audience / Insights` 为一组；
   `Integrations / Settings` 上方加 `overline` 小标 "Workspace" 与留白分组。
4. **移动端**：md 以下渲染顶部栏（wordmark + 汉堡），点开与营销页
   同款全屏覆盖菜单，底部含 `UserMenu` 内容。**不做 bottom tab bar**
   （工具型产品，覆盖菜单更一致且省维护）。

### 4.2 UI 包组件补全（C3/C4）

在 `packages/ui/src/components/` 增加，全部走 token、
`forwardRef`、与现有 Button 同代码风格：

| 组件 | 规格要点 |
|------|----------|
| `Button` 扩展 | 增加 `loading?: boolean`（内置 14px spinner，禁用点击、保持宽度）；新 variant：`danger` / `inverse` / `inverse-outline` |
| `Spinner` | 单色 currentColor 圆弧，约 800ms 匀速旋转 |
| `Badge` | `variant: neutral / accent / success / warning / danger`；底色用各色 soft 版（无 soft 的用 10% 透明度） |
| `Skeleton` | `bg-paper-sunken` + 1.8s opacity 呼吸（**非扫光**——shimmer 与 editorial 风格冲突） |
| `EmptyState` | 居中：细线图标 + `font-display` 标题 + 一句 body + 主按钮 |
| `Dialog` | 基于原生 `<dialog>`；`shadow-overlay` token；进出场 `motion.base` 缩放 0.98→1 |
| `DropdownMenu` | 供 `UserMenu` 与列表行操作复用 |
| `Toast` | 把 `apps/app/src/components/toast/Toaster.tsx` 下沉至 ui 包并导出 |

**验收**：`apps` 目录内不再有手写 spinner/toast/骨架；
所有 `{submitting ? "…" : "…"}` 三元换成 Button 的 `loading` prop。

### 4.3 页面级规范

- 每个列表页配 `EmptyState`。文案示例（studies）：标题 "No studies yet."，
  正文 "Describe what you want to learn — the Designer agent drafts the
  interview for you."，CTA "New study"。
- 数据加载中显示 3 行 `Skeleton`，不闪白屏。
- 页头统一：`font-display text-3xl` 标题 + 右侧主操作按钮 +
  下方 `border-b border-hairline`，抽成 `components/app/PageHeader.tsx`
  （注意与营销页的 `PageHeader` 区分命名或目录隔离）。

---

## Phase 5（P2）：设计系统文档化与守护

1. **扩充 `docs/design-system.md`**（不新建文件）：补充本方案确立的规则——
   斜体 accent 只用于关键短语、序号用 `font-display`、区块底色交替、
   "每屏至多一个常驻动效" 的动效预算、新增组件清单（Badge/Skeleton/
   EmptyState/Dialog/Dropdown/Toast/Spinner）、"Sign in" 措辞规范。
2. **CI 守护**：ESLint 规则或 CI grep，禁止 `apps/**` 出现
   `text-red-|bg-blue-|text-green-|bg-red-` 等 Tailwind 原生色类。
3. **截图基线**：合并后用 Playwright 对 `/`、`/pricing`、`/login`、`/studies`
   拍 375 / 768 / 1440 三档截图存 `docs/design/baselines/`，
   后续改动跑视觉 diff。

---

## 附录 A：顶级产品参考对照表

| 维度 | 参考 | 采纳什么 | 不采纳什么 |
|------|------|----------|-----------|
| 登录结构 | Linear | 单列居中卡片、登录方式优先级、无密码方向 | 其深色霓虹风 |
| 登录方式 | Notion | SSO 置顶 + 邮箱兜底 | 多工作区选择流程（现阶段单 org） |
| 方式记忆 | Vercel | "Last used" pill | Geist 黑白风格 |
| 会话安全 | Clerk 模式 | httpOnly cookie + middleware 守卫 | 引入 Clerk SDK（自建后端已有 auth） |
| 官网气质 | anthropic.com / Mercury | 衬线大标题、纸感底色、克制动效、编辑排版 | —（同源，全面对齐） |
| 产品叙事 | listenlabs.ai | 用真实对话 mock 讲产品、waveform 元素 | 其滚动动画密度 |
| Dashboard | Linear + Mercury | 侧栏 active 指示条、信息密度、空状态文案 | Linear 快捷键体系（二期） |

## 附录 B：执行顺序与依赖

```
1.1 应用合并 ──► 1.2 cookie 认证 ──► 2.1 统一登录页 ──► 2.2 / 2.3
                                  └► 4.1 侧边栏
3.1 假 logo 删除（可立即单独执行，不依赖合并）
3.4 next/font ──► 3.5 metadata
4.2 UI 组件补全 ──► 4.3 页面规范 ──► 5.x 文档与守护
```

每完成一个 Phase：`pnpm typecheck && pnpm build` 必须通过；
涉及 UI 的改动用 375 / 1440 两档宽度人工或 Playwright 过一遍关键页。
