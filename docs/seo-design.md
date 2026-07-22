# SEO 设计文档 — telepace-next

> 范围：`frontend/apps/app`（Next.js 15.5 / App Router / next-intl，域名 `telepace.io`）
> 更新日期：2026-07-22
> 决策前提（已确认）：
> - **zh 仅为双语完整性**，统一走 Google hreflang 打法，**不做百度/国内专项**。
> - **漏斗两端兼顾**，按"先底部快赢、再顶部铺量"的分阶段路线推进。
> 配套：任务拆解见第 7 节，建议整体并入 `TASKS.md` 的新 `T-5XX（SEO）` 块。

---

## 0. TL;DR

技术 SEO 地基已基本完成（canonical + hreflang + JSON-LD + sitemap/robots + OG image，见第 1 节），**本设计的重心不是补地基，而是往上盖两层**：

1. **技术收尾**（P0，1–2 天）：私有页 `noindex` 兜底、`demo` 页补 metadata、sitemap 真实 `lastmod`、接入 Search Console / Bing。
2. **内容与信息架构**（P1–P2，季度级）：新增 `compare / templates / learn` 三个内容路由组 + 把 `docs` 做成文档树，这是本品类 80% 自然流量的来源，也是当前的最大缺口。

---

## 1. 现状评估

### 1.1 已完成（不要重复劳动）

| 能力 | 位置 | 评价 |
|---|---|---|
| canonical + 完整 hreflang（含 `x-default`）+ 本地化 OG | `src/lib/seo.ts` `buildPageMetadata` | 双语站最易翻车的重复内容问题已正确处理 |
| JSON-LD 实体图（Organization / WebSite / SoftwareApplication / FAQ / Breadcrumb） | `src/lib/seo.ts` + `src/components/seo/JsonLd.tsx` | 用 `@id` 去重、`AggregateOffer` 拿免费徽章、FAQ/Breadcrumb 已用于 product/pricing |
| 全局身份图挂载 | `(marketing)/layout.tsx` | Organization/WebSite 每个营销页都可发现 |
| robots：私有面 disallow + sitemap 声明 | `src/app/robots.ts` | app/auth/respondent/api 已按 locale 前缀屏蔽 |
| sitemap：13 营销路径 × 2 语言 + hreflang alternates | `src/app/sitemap.ts` | 结构正确 |
| OG 图（根 + locale 双层） | `app/opengraph-image.tsx`、`app/[locale]/opengraph-image.tsx` | 分享预览无忧 |
| 爬虫可见性兜底 | `(marketing)/layout.tsx` 的 `<noscript>` 强制显示 `.tp-reveal` | 防止无 JS 爬虫拿不到内容 |
| 根 metadata（title 模板 / keywords / robots / OG / twitter） | `src/app/layout.tsx` | 完整 |

结论：技术 SEO ≈ 90 分。

### 1.2 缺口

- **私有页缺 `noindex` 兜底**：`/r/[campaignId]`（受访者链接）无任何 metadata export，仅靠 robots.txt `disallow` 不能保证不被收录（disallow ≠ 去索引；拿到外链会产生"仅 URL"收录）。
- **`(marketing)/demo/page.tsx` 无 metadata**：缺 canonical/hreflang。
- **sitemap `lastModified` 恒为 `new Date()`**：假的新鲜度信号，长期会被 Google 折损信任。
- **内容/信息架构层几乎为空**：无 blog / learn / 对比页 / 模板库；`docs` 仅单页占位。这是最大的战略缺口。
- **无度量闭环**：未见 Search Console / Bing 验证、自然流量分析、排名追踪。

---

## 2. 设计原则（分层模型）

SEO 按六层自下而上设计，每层是上层的前提：

```
6. 度量闭环 Measurement     ← 缺口（P0 接入）
5. 权威/外链 Authority      ← 靠第 4 层内容自然生长
4. 内容/信息架构 Content    ← 最大杠杆（P1–P2 主战场）
3. 结构化数据 Structured    ← 已完成，随新页复用
2. 页面 On-page             ← 已完成
1. 可抓取/可索引 Crawl      ← 已完成，仅需 4 项收尾
```

工程约束：所有新页面**必须复用** `buildPageMetadata` + 对应 `*Schema` 构建器，不得在页面里手写 metadata；私有/交易面**默认 `noindex`**，公开可索引是白名单而非默认。

---

## 3. 技术层 — 收尾项（P0）

1. **私有页 `noindex` 兜底**。给受访者页 `(public)/r/[campaignId]/page.tsx` 与 auth 页导出
   `export const metadata = { robots: { index: false, follow: false } }`（受访者链接对外分发，风险最高，优先）。建议在 `lib/seo.ts` 加一个 `noindexMetadata()` 复用。
2. **`demo` 页补 metadata**：接入 `buildPageMetadata({ locale, path: routes.demo, namespace: "metadata.marketing.demo" })`，与其余营销页一致。
3. **sitemap 真实 `lastmod`**：从内容源（第 4.3 节的内容集合的 `updatedAt`）或 git 提交时间派生，替换 `new Date()`。
4. **接入 Search Console + Bing Webmaster**：`app/layout.tsx` 加 verification meta（或 well-known 文件），提交 `sitemap.xml`，建立第 6 节的每周回看。

---

## 4. 内容与信息架构层（核心杠杆）

对"AI 用户研究 / 语音访谈"品类，绝大多数高质量自然流量来自当前完全缺失的四类页面。设计目标是**用一套可规模化的内容管线，把地基已有的 metadata/JSON-LD 能力承接起来**。

### 4.1 路由设计

在 `src/app/[locale]/(marketing)/` 下新增三个内容子树（复用 marketing layout 的全局身份图与 Nav/Footer）：

```
(marketing)/
  compare/[competitor]/page.tsx     ← 对比/替代页（底部漏斗，先做）
  templates/
    page.tsx                         ← 模板库索引
    [slug]/page.tsx                  ← 单模板页（程序化）
  learn/
    page.tsx                         ← 内容中心索引
    [slug]/page.tsx                  ← 教育文章（顶部漏斗）
  docs/... （把现有单页扩成文档树）
```

内容源：先用仓库内 MDX/JSON 内容集合（`content/compare/*.mdx` 等），零外部依赖、可 Git 版本化、天然静态化（`generateStaticParams`）。规模变大后再评估 CMS。

### 4.2 四类页面（按 ROI 排序）

- **对比 / 替代页（转化最高，最先做）**：`telepace vs Listen Labs`、`Listen Labs alternative`、`vs UserTesting / Dovetail / Maze`。搜索意图强、竞争低、直接截竞品品牌流量。**内容已在手** —— `telepace-vs-listenlabs-PRD.md` 就是首篇的素材。每页复用 `faqPageSchema` + `breadcrumbListSchema`（product 页已有先例）。
- **模板 / 程序化页（可规模化）**：访谈模板库（客户发现、流失访谈、定价测试、可用性测试……），每模板 = 一个可索引页 + 一个"用此模板"CTA 直连产品。一套模板数据 + 一个 `[slug]` 模板即可生成几十上百页。
- **教育层 / 内容中心（建主题权威 + 拿外链）**：`how to conduct user interviews`、`customer discovery questions`、`what is qualitative research`。转化低但抬升整站主题权威度与外链，间接抬高商业页排名。
- **文档树（命中技术/Agent 受众）**：把 `docs` 单页扩成真正的文档树（含 MCP / Agent 接入），开发者文档天然排名好，精准契合"Agent-first"定位。

### 4.3 sitemap 动态化

`sitemap.ts` 从静态数组改为：静态营销路径 + 遍历各内容集合（compare/templates/learn/docs）生成条目，`lastModified` 取内容 `updatedAt`。同时保留每条的 hreflang alternates（现有逻辑复用）。

### 4.4 内部链接

- 每个 learn/模板页底部固定链到相关的 compare 页与产品页（传递权重到商业页）。
- 首页与产品页增加通往 templates 索引与内容中心的入口（现在这些内容是"孤岛"就等于没有）。
- 面包屑（`breadcrumbListSchema`）在所有二级内容页启用。

---

## 5. i18n & GEO

### 5.1 i18n（zh = 双语完整性）

- 维持现状：`localePrefix: "always"`、`en` 为 `defaultLocale`、`x-default → en`（`lib/seo.ts` 已正确）。**不投入百度专项**。
- 内容层新页面：zh 至少保证 metadata（title/description）为**人工本地化**而非机翻，避免低质 zh 页拖累整站质量评分；正文可分阶段翻译，未译内容不进 sitemap 的 zh 条目。

### 5.2 GEO（被 AI 引用）

"Agent-first"定位与被 ChatGPT / Perplexity / Claude 引用高度契合，作为新兴获客渠道纳入设计：

- 在 `robots.ts` 明确 `GPTBot / ClaudeBot / PerplexityBot / Google-Extended` 的策略（默认允许公开营销/内容页）。
- 新增 `app/llms.txt`（route handler），列出核心页面与产品事实摘要。
- 内容页正文以**结构化、可抽取的事实陈述**为主（定义、步骤、对比表），提升被引用概率。

---

## 6. 度量闭环

最小闭环（P0 建立，之后每周回看）：

1. Search Console + Bing Webmaster 验证 → 提交 sitemap。
2. 自然流量分析：区分 organic 落地页与转化（signup）。
3. 每周看 query / 落地页 / 覆盖率报告，反哺内容选题与 P1/P2 优先级。
4. 成功指标见第 8 节。

---

## 7. 分阶段路线图与任务拆解

> 命名沿用 `TASKS.md` 的 `T-XXX` 与「背景/做/验收」体例；建议整体作为新 `T-5XX（SEO）` 块并入 `TASKS.md`。验收统一附加全局「全绿」命令 `pnpm lint && pnpm typecheck && pnpm build`。

### P0 — 技术收尾（1–2 天，无内容依赖）

- [x] **T-501 · 私有页 noindex 兜底**
  - 背景：`(public)/r/[campaignId]/page.tsx` 无 metadata；robots.txt disallow 不保证去索引，受访者链接对外分发风险最高。
  - 做：`lib/seo.ts` 新增 `noindexMetadata()`；受访者页与 auth 页导出 `robots:{index:false,follow:false}`。
  - 验收：构建产物中上述页面 `<meta name="robots" content="noindex,nofollow">` 存在；单测覆盖 `noindexMetadata()`。
  - ✅ 2026-07-22：`noindexMetadata()` 加入 `seo.ts`；`login`/`signup` 的 `generateMetadata` 展开它；
    respondent 页（客户端组件，无法自身导出 metadata）新增 `(public)/r/[campaignId]/layout.tsx` 承载它。
    生产构建 + `pnpm start` 实测 `/en/login`、`/en/signup`、`/en/r/<id>` 均且仅输出一条
    `<meta name="robots" content="noindex, nofollow">`；`seo.test.ts` 新增覆盖。

- [x] **T-502 · demo 页补 metadata**
  - 背景：`(marketing)/demo/page.tsx` 缺 canonical/hreflang。
  - 做：接入 `buildPageMetadata`，新增 `metadata.marketing.demo` 命名空间（en/zh 键一致）。
  - 验收：`/en/demo`、`/zh/demo` 输出自指 canonical + 完整 hreflang；无 `MISSING_MESSAGE`。
  - ✅ 已完成（复核确认）：`demo/layout.tsx` 早先已接入 `buildPageMetadata` + `metadata.marketing.demo`
    命名空间（en/zh 均有对应 key），补此勾选而非重做。

- [x] **T-503 · sitemap 真实 lastmod**
  - 背景：`sitemap.ts` 的 `lastModified` 恒为当前时间。
  - 做：改为从内容源/构建时 git 时间派生；营销静态页取内容修改时间。
  - 验收：`/sitemap.xml` 中不同页 `lastmod` 各异且与内容更新一致。
  - ✅ 2026-07-22：`sitemap.ts` 新增 `PATH_SOURCE_FILE` 映射 + `lastModifiedFor()`，对每个营销页的
    `page.tsx` 跑 `git log -1 --format=%cI`，取其真实最近提交时间；git 不可用时兜底一个固定日期
    （避免无 `.git` 的构建环境报错）。生产构建后 curl `/sitemap.xml` 验证：不同页 lastmod 各异
    （如 changelog `2026-07-13T02:36:26Z` vs. 其余页 `2026-07-15T14:08:49Z`），且与 `git log` 直接查询
    结果一致。

- [ ] **T-504 · 接入 Search Console + Bing**
  - 做：`app/layout.tsx` 加 verification；提交 sitemap；记录访问方式到本文件第 6 节。
  - 验收：两平台均验证通过、sitemap 已提交、覆盖率无致命错误。

### P1 — 底部漏斗快赢（本季度，最高 ROI）

- [ ] **T-511 · compare 路由 + 首篇对比页**
  - 依赖：T-503
  - 背景：对比/替代页转化最高，`telepace-vs-listenlabs-PRD.md` 内容已在手。
  - 做：建 `(marketing)/compare/[competitor]`；内容集合 `content/compare/*`；首篇 `telepace vs Listen Labs`；复用 `buildPageMetadata` + FAQ/Breadcrumb schema；接入 sitemap。
  - 验收：`/en/compare/listen-labs` 可静态生成、含 canonical/hreflang/FAQ JSON-LD、进入 sitemap；Rich Results 测试通过。

- [ ] **T-512 · templates 索引 + 单模板页 + 首批 3–5 模板**
  - 依赖：T-511
  - 做：`(marketing)/templates` 索引 + `[slug]`；内容集合承载模板；每页含"用此模板"CTA 直连产品。
  - 验收：模板页可索引、结构化数据无误、内部链接与 CTA 生效、进入 sitemap。

- [ ] **T-513 · 内部链接与内容管线固化**
  - 依赖：T-511, T-512
  - 做：抽出内容读取/`generateStaticParams`/sitemap 生成的公共工具；二级内容页统一启用面包屑；首页/产品页加入内容入口。
  - 验收：无内容孤岛（每新页至少 1 条内部入链）；sitemap 自动纳入新内容。

### P2 — 顶部漏斗铺量与权威（持续）

- [ ] **T-521 · learn 内容中心 + 首批文章**
  - 依赖：T-513
  - 做：`(marketing)/learn` 索引 + `[slug]`；首批 5 篇高意图教育文章（en 优先）。
  - 验收：文章可索引、含 Article/Breadcrumb schema、内链回商业页。

- [ ] **T-522 · docs 扩为文档树**
  - 做：把现 `docs` 单页扩成多页文档树（含 MCP/Agent 接入）。
  - 验收：文档多页可索引、层级面包屑正确、进入 sitemap。

- [ ] **T-523 · GEO：AI 爬虫策略 + llms.txt**
  - 做：`robots.ts` 明确 AI 爬虫策略；新增 `app/llms.txt`。
  - 验收：`/robots.txt` 含对应 UA 规则；`/llms.txt` 可访问且内容有效。

- [ ] **T-524 · zh 内容本地化补齐**
  - 做：对已上线 compare/templates/learn 补齐人工本地化 zh 正文；未译不进 zh sitemap。
  - 验收：zh 页 metadata 人工本地化；sitemap zh 条目与已译内容一致。

---

## 8. 成功指标（验收 SEO 是否奏效）

- **覆盖率**：Search Console 有效收录页数随内容页上线单调上升，私有页 0 收录。
- **底部漏斗**：compare/templates 页的 organic 落地 → signup 转化（P1 起跟踪）。
- **顶部漏斗**：learn/docs 的 organic 曝光与点击（P2 起跟踪）。
- **技术健康**：无重复内容告警、hreflang 无错误、Rich Results 全部有效。
- **每季度回看**：依 Search Console query 报告调整内容选题与优先级。

---

## 附录：关键文件索引

| 用途 | 路径 |
|---|---|
| SEO 元数据 + JSON-LD 构建器 | `frontend/apps/app/src/lib/seo.ts` |
| JSON-LD 渲染组件 | `frontend/apps/app/src/components/seo/JsonLd.tsx` |
| robots | `frontend/apps/app/src/app/robots.ts` |
| sitemap | `frontend/apps/app/src/app/sitemap.ts` |
| 根 metadata / OG | `frontend/apps/app/src/app/layout.tsx`、`app/opengraph-image.tsx` |
| i18n 路由 | `frontend/apps/app/src/i18n/routing.ts` |
| 站点配置（域名/品牌） | `frontend/packages/config/src/site.ts` |
| 对比页素材 | `telepace-vs-listenlabs-PRD.md` |
| 受访者页（需 noindex） | `frontend/apps/app/src/app/[locale]/(public)/r/[campaignId]/page.tsx` |
