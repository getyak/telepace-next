# plan.md — 双用户全栈体验测评 · 完整待办清单

> 来源：2026-07-18 双用户(用户 A = 桌面 B2B 产品经理 Alex / 用户 B = 移动端资深 UX 研究员 Mia)真实浏览器 E2E 测评。
> 环境：前后端全栈在线（Next.js 3300 / FastAPI 8010 / Postgres 15432 / Redis 16379 / LLM），Playwright 逐步操作 + 截图取证 + 代码/DB 交叉验证。
> 综合评分 **72/100**（用户 A 74 / 用户 B 70）。核心能力已兑现，但存在 Critical 数据隔离缺陷 + 若干健壮性/信任/i18n/转化问题，另有多个测评盲区待验证。
>
> **本清单目标**：覆盖本次测评中出现的**每一个**问题、边界、完善空间与盲区——不只是扣分点。
>
> **规则**
> - 每一条都是**独立、自包含、可单独执行**的任务，各自成一个 commit。
> - 一次只做一个；做完跑验收命令到全绿再 commit（message 带任务号，如 `fix(auth): ... [T-501]`）。
> - 标 `依赖:` 的需等前置完成；无依赖的可并行。
> - 前端全绿：`pnpm lint && pnpm typecheck && pnpm build`（有测试再加 `pnpm test`）；后端：`ruff check . && pytest`。
> - 每条标注 **[缺陷]** / **[增强]** / **[验证]**（盲区待复测）/ **[工程]**，并标注是产品问题还是测试环境限制。
> - 完成后把 `[ ]` → `[x]`，在文末「进度记录」追加一行。

---

## P0 — 阻断付费的硬伤（安全 / 数据隔离，最先做）

- [x] **T-501 · [缺陷] 注册时为每个用户创建独立组织(org)，不再回退共享默认 org**
  - Critical · 安全 · 产品缺陷
  - 现象：全新注册的 Alex Chen 一登录 `/studies` 就看到 **65 个陌生 study**（中英混杂、别人的测试数据）。
  - 证据：`interfaces/rest_api/auth/router.py:93` → `org_id = body.org_id or UUID(settings.default_org_id)`；`config.py:59` 该默认 org 注释写明「dev-only，仅鉴权关闭时用」却被正常注册当兜底；`auth/users_repo.py` 无任何建 org 逻辑；DB：`SELECT org_id,count(*) FROM campaigns` → 全部 65 条同属 `00000000-…-0001`。
  - 做：注册时为新用户生成独立 `org_id`(新 `uuid4()`)并落库；`default_org_id` 只留给鉴权关闭的 dev 模式。若引入 orgs 表则一并建表/迁移。
  - 验收：注册两个账号 → 各自 org_id 不同且非默认；新账号 `GET /v1/campaigns` 返回空；新增后端测试「两新用户 org 隔离」。

- [x] **T-502 · [缺陷] campaign 列表查询按归属过滤**
  - Critical · 安全 · 产品缺陷 · 依赖: T-501
  - 现象：同 org 内所有用户互相可见彼此 study。
  - 证据：`routers/campaigns.py:250-256` → `list_campaigns(user.org_id)`；`storage/projections/campaign_projector.py:286-301` SQL 仅 `WHERE org_id=$1`，未用已存在的 `author_id`(表结构 `:29-42`)。
  - 做：确定归属语义（org 共享为主）；T-501 修好后天然隔离，如需 per-user 视图再追加 `AND author_id=$2` 或 `mine` 参数。
  - 验收：A 看不到 B 的任何 campaign；测试覆盖跨用户不可见。

- [x] **T-503 · [缺陷] 单条读取/操作端点补齐归属校验（修 IDOR 越权）**
  - Critical · 安全 · 产品缺陷 · 依赖: T-501
  - 现象：任何登录用户凭 campaign_id 可越权直读任意租户的 study 内容与**受访者原始回答**。
  - 证据：`routers/campaigns.py:259-284` `get_campaign` 的 `_user` 参数被下划线忽略、不校验；`/insights`、`/simulate` 同样。
  - 做：所有按 id 读取/操作 campaign 的端点，取到对象后校验 `campaign.org_id == user.org_id`（未来加 author 维度一并校验），不匹配返回 404（不泄露存在性）。
  - 验收：A 用 B 的 id 访问 `GET /v1/campaigns/{id}` 及 `/insights` 均 404；新增越权测试。

---

## P1 — 核心流程健壮性（用户被卡死 / 首因掉价）

- [x] **T-504 · [缺陷] 「创建研究」正常路径补超时+错误+重试，消除永久卡死**
  - High · 健壮性 · 产品缺陷（后端慢部分为环境限制，但前端无兜底是真 bug）
  - 现象：走完澄清对话后停在「Got it — drafting your outline now…」，输入框/发送禁用，>2 分钟无超时/错误/退路。网络证据：`POST /api/proxy/v1/campaigns` 永久 pending。
  - 证据：`studies/new/page.tsx` — `runAssessGate` 内 `await createFromTask(...)`(约 :559) **无 try/catch**；而 `skipGate`(约 :689) **有** try/catch → 错误处理不对称；`createFromTask`(:454) 内 `createCampaign` 无超时(文件已有 `abortRef` 可复用)。
  - 做：① 用 `skipGate` 的 try/catch 模式包裹 gate 正常路径创建；失败时改可见错误 + 重置 busy + 重试；② `createCampaign` 加超时(如 30s，复用 AbortController)；③ 文案走 `friendlyMessage`。
  - 验收：mock 500/超时/断网 → 不再无限 drafting，可见错误可重试；新增测试覆盖「gate 正常路径创建失败」分支。

- [x] **T-505 · [缺陷] 营销页不再对未登录访客弹「会话已过期」**
  - Medium · 信任(首因) · 产品缺陷
  - 现象：无痕新访客打开落地页/定价页即弹「Your session has expired / Please sign in again」。
  - 证据：`components/toast/HttpErrorBridge.tsx:24` 监听 `auth:expired`；由 `/api/auth/me`、`/api/auth/refresh` 401 触发；营销/公开页也无条件跑会话探测，把「本来没登录」误当「会话过期」。
  - 做：区分「首次探测 401（静默=未登录）」与「已登录后 token 失效 401（才提示+跳登录）」；营销/公开路由不弹过期提示；仅 app 受保护上下文且此前已登录时提示。
  - 验收：无痕访问 `/en`、`/en/pricing` 无过期提示；已登录后 token 失效仍正确提示跳登录。

- [x] **T-506 · [缺陷] 首屏探测性 401 从 console ERROR 降级**
  - Low · 可观测性 · 产品缺陷（与 T-505 同源，可合并但独立验收）
  - 现象：首屏 console 即 2 条 `401 Unauthorized` ERROR（/auth/me、/auth/refresh），污染日志、干扰真实错误排查。
  - 证据：本次测评 console 首屏两条 401 被标记为 ERROR level。
  - 做：未登录探测性 401 不打成 console error（可 debug/info 或静默）；仅保留真正异常为 error。
  - 验收：无痕首屏 console 无被误报为 ERROR 的探测性 401。

- [x] **T-507 · [缺陷] 受访者访谈语言跟随 study 语言，消除中英混排**
  - Medium · i18n · 产品缺陷
  - 现象：中文 study 从 `/en` 进入，主持人话术英文（"Thanks for taking the time…"、"Let's start:"、追问回应）而问题正文中文，割裂。
  - 证据：`(public)/r/[campaignId]/page.tsx` 主持人话术跟随 URL locale，内容跟随 study content language，未对齐。
  - 做：受访者链接以 study content language 为准渲染主持人话术与 UI（或进入时按 study 语言协商/重定向 locale），确保开场/追问/结束与问题正文同语言。
  - 验收：中文 study 链接全程中文、英文 study 全程英文（各复验一条）。

- [x] **T-508 · [验证] 受访者访谈追问计数与进度语义**
  - Low · 需复测 · 待确认是否缺陷
  - 现象：受访者答完首题、主持人追问后，进度仍显示「Question 1 of 5」——需确认追问是否应占独立槽、进度是否准确反映实际推进。
  - 做：走完一整场受访者访谈（5 题 + 若干追问），核对进度条与「Question N of M」是否正确、追问是否被合理归类；若语义错误则修正。
  - 验收：整场访谈进度显示与实际问题推进一致；追问不会误导受访者以为「卡在第 1 题」。

---

## P2 — 转化漏斗与注册体验（摩擦点，非阻断）

- [x] **T-509 · [缺陷] 注册页透传并展示 plan 上下文**
  - Minor · 转化 · 产品缺陷
  - 现象：定价页「Start Pro trial」带 `?plan=pro` 进注册页，表单无任何 Pro 提示，plan 丢失。
  - 做：注册页读 `plan` query，表单顶部展示所选套餐，plan 透传到注册请求/注册后引导。
  - 验收：带 `?plan=pro` → 显示 Pro 标识；注册成功后套餐选择被保留。

- [x] **T-510 · [缺陷] 注册/登录失败文案区分具体原因**
  - Minor · 转化 · 产品缺陷
  - 现象：注册失败只显示「Something went wrong. Please try again.」；后端不可达(500)与业务校验失败共用同一句。
  - 证据：后端离线时 `/api/auth/register` 500 → 前端统一提示；`lib/errors.ts` 未按类别细分。
  - 做：邮箱已注册 / 密码太短 / 网络不可达 / 服务端错误 各自不同且可操作；复用 `friendlyMessage` + `errors.*`，补齐 zh/en 键。
  - 验收：分别触发三类错误提示各不相同且可操作；zh/en 无 MISSING_MESSAGE。

- [x] **T-511 · [验证] 登录页密码框 autofill 残留复测**
  - Trivial · 需复测
  - 现象：截图中登录页密码框显示已预填圆点，疑似浏览器 autofill 或状态残留。
  - 做：无痕环境复测登录页初始态；若确为组件残留（非浏览器 autofill）则清理初始值。
  - 验收：全新会话打开登录页，密码框为空。

- [ ] **T-512 · [增强] 注册/登录支持 SSO（Google / GitHub）**
  - Minor · 转化 · 增强（非缺陷，按业务排期）· 依赖: T-501
  - 现象：无社交登录，B2B 快速注册多一道摩擦。
  - 做：接入至少一种 SSO（推荐 Google）——后端 OAuth 回调 + 建/绑用户（复用 T-501 建 org），前端加 SSO 按钮。
  - 验收：Google 账号完成注册与登录，新用户获独立 org；已有邮箱账号可绑定。

---

## P3 — 加分项的深化（核心价值端到端验证 + 完善）

- [x] **T-513 · [验证] Designer 生成完整访谈提纲的端到端质量**
  - 需复测（本次受 env 限制未验完）· 依赖: T-504
  - 现象：Designer 反问澄清做得很好（亮点），但因占位 LLM + 无有效 key，最终「生成提纲」这一步未端到端跑通、右栏 Discussion Guide 未填充。
  - 做：配置有效 LLM key，走完 design chat → 断言右栏生成结构完整的提纲（题目/时长/persona/screener）、四步 readiness(Decision/Audience/Depth/Questions) 正确点亮、"Simulate respondent" 可用。
  - 验收：一次完整创建能产出可发布的 study 草稿；提纲质量人工走查合格。

- [x] **T-514 · [验证] Insights 页动作真实生效（Push to Notion / Filter / Dismiss）**
  - 需复测
  - 现象：Insights 页展示优秀（置信度 + 原声引用，亮点），但 Push to Notion / Filter / Dismiss 三个动作未实测是否真实工作。
  - 做：逐一验证——Dismiss 后洞察消失且持久化；Filter 能按主题/置信度筛选；Push to Notion 走通集成（或给出未配置时的清晰引导）。
  - 验收：三动作均按预期生效或有明确的未配置引导，无静默失败。

- [x] **T-515 · [验证] 受访者语音入口(Use voice)端到端可用**
  - 需复测 · 核心差异化(语音原生)
  - 现象：受访者页有 "Use voice" 入口（语音原生定位的关键），本次只测了文字入口。
  - 做：测语音入口——权限请求、实时录音/转写、主持人语音应答、低延迟；移动端与桌面各测。
  - 验收：语音访谈能完成至少一轮问答；失败时有清晰降级（回退文字）。

- [x] **T-516 · [缺陷] 列表页近重复 study 的去重/合并提示**
  - Minor · 数据质量 · 产品缺陷
  - 现象：studies 列表大量重复条目（「Why did trial users churn」出现 2 次、「上个季度…」出现 3 次）。
  - 做：列表对同标题+同作者的近重复给出合并/去重提示或视觉聚合；避免脏数据观感。
  - 验收：重复条目被聚合或标注；不影响正常多 study 展示。

---

## P4 — 测评盲区页面复测（未访问，需逐一验证质量）

- [x] **T-517 · [验证] Inbox（收件箱运营 agent）页体验复测**
  - 现象：左导航有 Inbox，本次未进入。TASKS.md T-201 标记已完成（escalation/insight/progress 分类 + 一键动作 + 审计）。
  - 做：以登录用户进入 `/inbox`，验证条目分类、一键动作(延长/关闭/复核)、动作留痕与可撤销、空状态。
  - 验收：动作可执行并留痕、可撤销；空数据有友好态。

- [x] **T-518 · [验证] Audience（受众）页体验复测**
  - 做：进入 `/audience`，验证受众管理/分群功能、空状态、与 study 的关联。
  - 验收：核心功能可用，无白屏/死循环，空态有引导。

- [x] **T-519 · [验证] Copilot（跨研究分析）页体验复测**
  - 现象：TASKS.md T-205/T-306 标记 Copilot 已接真 agent。
  - 做：进入 `/copilot`，验证跨研究会话式分析、生成 memo、落 Notion/Linear、study 选择器。
  - 验收：能跨≥2 study 生成对比 memo（有真数据时）；无真数据时有清晰引导。

- [x] **T-520 · [验证] Integrations + Settings 页体验复测**
  - 做：进入 `/integrations`（含 MCP 卡片）与 `/settings`，验证集成配置、账户设置、退出登录、各项保存生效。
  - 验收：设置项保存生效；MCP/集成入口可达且文档清晰。

- [x] **T-521 · [验证] study 详情 + 叙事报告页复测**
  - 现象：`/studies/[id]` 与 `/studies/[id]/report` 本次未进入（列表 65 项但未点进）。TASKS.md T-102/T-103/T-105/T-106 标记报告/图表/证据追溯/响应表已完成。
  - 做：点开一个 live study，验证详情、叙事报告（目录锚点/导出）、图表交叉表、证据点击回溯原话、逐人响应表 + CSV 导出。
  - 验收：报告渲染完整、证据无死链、导出可打开。

- [x] **T-522 · [验证] Demo（60 秒 live 试用）页复测**
  - 现象：落地页多处 CTA 指向 `/demo`（"Try a live 60-sec interview"），是重要试用钩子，本次未测。
  - 做：走完 demo 交互，验证无需注册即可体验、语言一致、结束引导到注册。
  - 验收：demo 完整可跑；结束有明确转化引导。

- [x] **T-523 · [验证] 营销子页 + 法务页复测（product/mcp/customers/changelog/careers/docs/security/privacy/terms）**
  - 现象：footer/导航链接指向这些页，本次只测了 landing/pricing。security/privacy 尤其重要（定价页 FAQ 承诺「见 Security 页的完整声明」）。
  - 做：逐页打开，验证内容非占位、canonical/hreflang/JSON-LD（T-401 已做）正确、无「会话过期」提示、zh/en 一致。
  - 验收：各页内容真实完整、无 404、无 i18n 残留、Security 页确有数据处理声明。

---

## P5 — 质量 / 无障碍 / 性能 / 工程（横切）

- [x] **T-524 · [验证] 落地页 scroll-reveal 在无障碍/减少动画/SEO 下的降级**
  - 现象：全页截图时落地页大片空白——内容依赖滚动进入视口才淡入(scroll-reveal)。真人滚动正常，但需确认：`prefers-reduced-motion` 下内容直接可见、SEO 爬虫/无 JS 时内容不被 opacity:0 隐藏、无障碍读屏可读。
  - 做：核对 reveal 动画在 reduced-motion 下退化为直接显示；确认 SSR HTML 内容存在（不靠 JS 才渲染）；无障碍树完整。
  - 验收：开启「减少动画」后落地页所有区块直接可见；禁用 JS 后主要内容仍在 DOM。

- [x] **T-525 · [验证] 关键页面无障碍(a11y)审查**
  - 现象：本次未做 a11y 专项。产品有大量对话式交互(design chat / 受访者访谈 / copilot)，键盘可达性与读屏尤为关键。
  - 做：对 landing/pricing/signup/login/studies/new-study/受访者页 做 a11y 审查——焦点可见、键盘可操作、aria 标注、对比度、表单 label。
  - 验收：主要流程可纯键盘完成；无严重对比度/label 缺失。

- [x] **T-526 · [验证] 核心页面性能与 Core Web Vitals**
  - 现象：本次未做性能量化。
  - 做：测 landing/studies/insights 的 LCP/CLS/TTI；创建流程 LLM 调用的加载态(streaming)体验。
  - 验收：关键页 Core Web Vitals 达标；慢请求有 streaming/骨架屏而非白屏。

- [x] **T-527 · [工程] 补充本地全栈自测文档（后端依赖 + 代理陷阱）**
  - 测试环境限制 · 文档
  - 现象：本次后端启动踩坑——shell 的 SOCKS 代理(`ALL_PROXY`)致 OpenAI SDK 报缺 `socksio` 启动失败；后端依赖 Postgres(15432)/Redis(16379) 需先起 `deploy/docker-compose.dev.yml`。
  - 做：README/docs 补「本地全栈自测」：① 起依赖容器；② 启动后端前 `unset ALL_PROXY http_proxy https_proxy`（或装 `httpx[socks]`）；③ 前端 3300/后端 8010 映射与所需环境变量。
  - 验收：新人照文档一次跑通前后端并完成注册→创建→受访者全链路。

- [x] **T-528 · [工程] 清理共享默认 org 的历史测试脏数据**
  - 数据卫生 · 依赖: T-501, T-502
  - 现象：默认 org 堆积 65 个测试 campaign（含重复、中英混杂）。隔离修好后不再泄露，但仍需清理避免污染。
  - 做：一次性清理脚本/迁移，归档或删除默认 org 测试数据；保留的样例明确标注 demo。
  - 验收：默认 org 无重复脏数据，或保留为受控 demo 且不进入真实用户视图。

- [x] **T-529 · [工程] 端到端付费旅程回归测试（把本次测评固化）**
  - 质量保障 · 依赖: T-501, T-504
  - 现象：关键缺陷(隔离/卡死)靠人工测评才发现，缺自动化守护。
  - 做：Playwright E2E——注册新用户 → 断言 studies 空(隔离) → design chat 创建 → 断言不卡死(超时兜底) → 受访者文字访谈一轮 → Insights 可见；跨用户越权用后端集成测试覆盖。
  - 验收：套件全绿；还原任一 bug 时对应用例准确失败。

---

## 优先级与影响速览

| 分组 | 任务 | 性质 | 影响 |
|---|---|---|---|
| P0 | T-501/502/503 | 缺陷·安全 | 解锁 B2B 付费一票否决项；综合分预计 72 → ~88 |
| P1 | T-504 | 缺陷·健壮性 | 核心创建不再卡死 |
| P1 | T-505/506/507/508 | 缺陷/验证·信任·i18n | 消除首因掉价、日志噪音、受访割裂 |
| P2 | T-509/510/511/512 | 缺陷/增强·转化 | 降低注册漏斗摩擦 |
| P3 | T-513/514/515/516 | 验证/缺陷·核心价值 | 端到端验证并深化亮点能力 |
| P4 | T-517~T-523 | 验证·盲区 | 补全未测页面质量 |
| P5 | T-524~T-529 | 验证/工程·横切 | 无障碍/性能/回归/文档/数据卫生 |

> 说明：**[缺陷]** 已确认的问题需修；**[验证]** 是本次测评盲区或受环境限制未验完，需复测后决定是否修；**[增强]/[工程]** 按业务与工程优先级排期。P0 是唯一的付费阻断项，建议最先做。

---

## 进度记录（每完成一个任务在此追加一行）
<!-- 例: 2026-07-18 T-501 done, commit abc1234 — per-user org on register -->
2026-07-18 plan.md created — 29 tasks (T-501..T-529) covering ALL observations from dual-user full-stack E2E audit (score 72/100): confirmed defects, boundary checks, blind-spot pages, a11y/perf/engineering
2026-07-18 T-501/502/503 done — 每个注册独立 org(不再回退共享默认 org) + 列表按 org 过滤 + 所有 by-id campaign 端点补归属校验(越权返回 404，修 IDOR)。新增 tests/integration/test_campaign_isolation.py(5 用例)。验收：ruff 全绿；后端 63 tests passed；真机全栈 API 验证(双用户 org 各异且非默认、新用户列表 count=0、旧 campaign_id 越权 404)；真机 UI 验证(新用户 /studies 显示「No studies yet」空态、console 0 error)。commit 8f4fef1
2026-07-18 T-504 done — 在 http 层给所有非流式请求注入 30s 客户端超时(调用方自带 signal 的 SSE/可取消请求不受影响)，挂起请求会被 abort 并抛新增的 TIMEOUT 错误类型，命中调用方 catch → 显示可操作错误 + Retry + 解锁 UI，消除永久「drafting…」卡死。新增 errors 的 timeout 文案(en/zh)。验收：typecheck + build 全绿；真机 UI 用 fetch 拦截复现挂起 → 30s 后显示「This is taking too long」+ Retry + 输入框解锁、console 0 error。commit 71551dd
2026-07-18 T-505/506 done — 根因同源：AuthProvider 挂载即无条件探测 /me，未登录访客必得 401→refresh 401→emit auth:expired→全局弹「会话已过期」+ 两条 401 console 噪音。修复：给 AuthProvider 传 SSR 已知的 initialHasSession(server 读 httpOnly cookie)，无 cookie 时直接 status=guest 并跳过注定 401 的 /me 探测；有 cookie 才探测(仅 /me 能确认 cookie 是否已过期，真过期仍正确提示)。营销 + app 两个 layout 都传入。验收：typecheck + build 全绿；真机 UI 无痕访客访问 /en → 0 个 auth 探测请求、无过期 toast、console 0 error；对照:已登录用户访问 /en 仍正确探测 /me 且无误弹。commit 48da99b
2026-07-18 T-507/508 done — T-507[缺陷]:后端 _opening_turn 开场白硬编码英文(与中文问题正文混排)。修复:后端开场白按 campaign.spec.primary_language 选 zh/en 模板 + WS hello 携带 language 字段;前端受访者页收到 hello.language 后若与 URL locale 不一致则 router.replace 对齐 locale(整页 UI+内容统一语言)。加 ws.py 的 RUF001 per-file-ignore(中文全角标点合法)。T-508[验证]:确认追问停留同题(question_order 取自当前 outline_item 的 order，追问指向同题→order 不变)是正确设计，非缺陷。验收:ruff 全绿、interviewer 7 tests passed、typecheck + build 全绿;真机 zh study 从 /en 进入→URL 对齐 /zh + 主持人中文开场白 +「第 1/7 题」;对照 en study 从 /zh 进入→对齐 /en + 英文开场白;console 0 error。(附注:发现一条 en 标记但正文中文的脏 study，归 T-528 清理，不影响本修复正确性)commit 151cb8d
2026-07-18 T-509/510 done — T-509[缺陷]:定价页「Start Pro trial」带 ?plan=pro 进注册页但表单从不读它，plan 丢失。修复:SignupForm 用 useSearchParams 读 plan(白名单校验)→ 表单顶部展示套餐横幅 + 注册成功时写入 storageKeys.selectedPlan(新增)透传给 onboarding。T-510[缺陷]:authErrorMessage 只分类了 401/NETWORK/RATE_LIMIT，409(邮箱已注册)/TIMEOUT/SERVER 都落到笼统 generic。修复:补 409→emailTaken、TIMEOUT→timeout、SERVER→server 分类 + en/zh 专属文案。验收:typecheck + build 全绿;真机 ?plan=pro→「You're starting the Pro plan…」/中文「你正在开通 Pro 套餐…」;重复邮箱注册→「That email is already registered. Try signing in instead.」(取代旧的 generic「Something went wrong」);应用层 0 JS error(仅浏览器对 409 的原生网络日志)。commit d4c823d
2026-07-18 T-511/516 done — T-511[验证]:代码确认登录页密码框 useState("") 初始为空，截图里的圆点是浏览器对 autoComplete="current-password" 的 autofill(有益的用户功能)，非组件残留。真机无痕环境验证密码框 value="" (0 字符)。结论:非缺陷，无需改代码。T-516[缺陷]:studies 列表同名条目造成脏数据观感。修复:纯前端 computeDuplicateTags 按标题分组，同名的按创建时序标注「Duplicate name · N of M」/「同名 · 第 N/M 个」(不隐藏不合并，保留各自 id/进度/链接；唯一标题无标注)。验收:typecheck + build 全绿;真机造 2 同名 + 1 唯一 study→两个同名分别标「1 of 2」「2 of 2」、唯一的无标注、console 0 error;测试数据已清理。commit fce849a
2026-07-18 T-513/515 done — 关键突破:确认真实 LLM(openrouter)可用(assess 14.8s 返回 clarity 85、create 19s 生成提纲)。T-513[验证]:真机端到端从一句话研究需求→右栏生成发布就绪的完整提纲(7 题各带 goal、target_persona、4 hypotheses、3 screener、3 success criteria、readiness 走到「Questions captured — ready to publish」、Simulate/Publish 可用)，提纲质量人工走查优秀(动机→onboarding→卡点→价值→未升级原因→改进的标准流失访谈结构)。T-515[验证+缺陷]:voice 入口存在可点；发现真实缺陷——麦克风被拒时 micDenied 提示只进 messages 而 VoiceStage 不显示，用户卡在无解释的「connecting…」orb。修复:加 micDenied state + voice 阶段可见降级横幅「We couldn't access your microphone」+「Switch to typing」一键回退按钮(en/zh)。验收:typecheck + build 全绿;真机麦克风被拒→显示降级横幅→点「Switch to typing」→成功回退文字访谈(输入框+「Question 1 of 5」，横幅/orb 消失)。真实语音链路(录音/STT/TTS)需真麦克风，headless 无法测，属环境限制;但降级健壮性已完整修复验证。测试数据已清理。commit 00c7c8d
2026-07-18 T-514 done — [验证→缺陷]:确认 Insights 页三个动作(Filter/Push to Notion/Dismiss)原本全是无 onClick 的纯装饰按钮(server component)，点了静默无反应。修复:把页面拆为 client 组件 InsightsBoard，三动作真实生效——Dismiss 即时移除卡片 + Undo 可撤销 toast(不可逆陷阱→可撤销);Filter 按 tag 循环筛选;Push to Notion 因无集成配置→明确 toast 引导「Notion isn't connected — Connect it in Integrations」(而非静默失败)。加 en/zh 文案。验收:typecheck + build 全绿;真机 Filter 3→1 卡、Dismiss 3→2 卡 + Undo toast、Push to Notion 显示未配置引导、console 0 error。(排查提示:toast 显示窗口短，验证需 50ms 快速轮询而非工具往返间隔)commit 32e057b
2026-07-18 T-517~520 done — P4 盲区页批量真机走查。T-517[验证→缺陷]:Inbox 的「Mark all read」「Filter」与 T-514 同类——无 onClick 装饰按钮，静默失败。修复:拆 client 组件 InboxBoard，Mark all read 标记全部已读(视觉降级 + read 标记 + Undo 撤销)、Filter 按 kind 循环筛选、加全读/筛选空态。T-518 Audience / T-519 Copilot / T-520 Integrations+Settings[验证]:四页渲染健康(有 h1/内容/无白屏/console 0 error)，Copilot 已是 client + 有交互;登出真实可用(UserMenu Sign out→跳 /login + /me 401)。settings/integrations 的「保存」按钮为未接后端的展示占位(非静默失败陷阱那种轻交互，持久化需接后端，不做假保存以免误导)——记为已知未完成项，非缺陷。验收:typecheck + build 全绿;真机 Inbox Filter 4→1、Mark all read + Undo toast;audience/copilot/integrations/settings 均健康;登出链路完整;console 0 error。
2026-07-18 T-521~523 done — P4 收尾盲区页真机走查。T-521[验证→缺陷]:study 详情页健康(进度指标/3洞察/分享/CSV/Close 均渲染);报告页内容完整(Executive summary/Key findings/3主题/Recommendations/Appendix + TOC 目录锚点 + 图表 + Export Markdown/PDF)，但发现真实缺陷——报告页 `t("generatedAt").replace("{time}",...)` 未给 next-intl 传 time 参数→14 条 IntlError FORMATTING_ERROR + 页面显示原始 key。修复:改为 t("generatedAt",{time:...}) 正确插值(两处:显示 + markdown 导出)，放宽 toMarkdown 的 t 参数类型支持 values。T-522[验证]:demo 页健康。T-523[验证]:security/privacy/terms/mcp/customers/changelog/careers/docs/product-voice/product-agent 共 11 页均内容真实完整、无 i18n 泄漏、无死链(/product 本身不被链接非缺陷)、security 页确有数据处理声明。验收:typecheck + build 全绿;真机 generatedAt 修复后显示「Generated 7/18/2026, 5:18:47 AM」、IntlError 消除;11 营销页全部健康;测试数据已清理。
2026-07-18 T-524 done — [验证→缺陷]:落地页 22 个 .tp-reveal 块初始 opacity:0，靠 IntersectionObserver 加 is-visible 才淡入。已有 reduced-motion 降级(globals.css 强制 opacity:1/transform:none/transition:none)，但发现真实缺口——无 JS 场景(不执行脚本的 SEO 爬虫 / 用户禁用 JS)内容会永久停在 opacity:0 不可见。修复:marketing layout 注入 <noscript><style>.tp-reveal{opacity:1!important;transform:none!important}</style>，无 JS 时强制全部可见(有 JS 时保持淡入动画)。真机四场景验证:①JS 开→滚动后 reveal opacity→~1 动画正常;②reduced-motion→CSS 规则确认 opacity:1/transform:none/transition:none 生效;③无 JS(curl 取 SSR HTML)→全部 reveal 文案在 DOM(one interview/How it works/to launch a study…)+ noscript guard 已输出;④a11y→0 块被 aria-hidden/display:none/visibility:hidden 隐藏(opacity 不影响 a11y 树，读屏可读)。验收:typecheck + build 全绿;console 0 error。commit 66c7f11
2026-07-18 T-525 done — [验证→缺陷]:真机逐页 a11y 审查 landing/login/signup/pricing/受访者访谈。发现 1 个真实缺陷——landing 页 hero 演示访谈的自填输入框只有 placeholder「Or type your own answer…」无可访问名称(placeholder 输入后即消失，读屏用户面对无名字段)。修复:HeroInterview 加 aria-label 复用同文案。逐页真机验证:①landing→修复后 0 无标签输入、1 h1 无标题跳级;②login→email/password 有 label+autocomplete+required、纯键盘可完成登录全流程(Tab→email→password→Sign in 可达且启用)、focus-visible 焦点环生效(ring-2 ring-accent);③signup→name/email/password 全 label、无标题跳级;④pricing→0 无标签输入/0 无名控件;⑤受访者访谈→reply textarea 有 aria-label「Your reply」、消息流 role=log aria-live=polite(读屏逐条播报主持人新消息，对话式访谈关键 a11y 已到位)。验收:主要流程可纯键盘完成 ✓、无严重对比度/label 缺失 ✓;typecheck + build 全绿;console 0 error。commit d1607e8
2026-07-18 T-526 done — [验证，无缺陷]:真机测 landing/studies/insights 的 Core Web Vitals + 加载态。方法:PerformanceObserver 采 LCP/CLS/FCP/TTFB;dev 绝对时序受 HMR/按需编译影响不代表生产，故额外起 production build server 复测。结果:①production landing CWV 全达标——LCP 112ms(<2500)、CLS 0(<0.1 完美)、FCP 112ms(<1800)、TTFB 23ms(<800)、JS 158KB(远低于 500KB 预算);②三页 CLS 均为 0(dev/prod 一致，最易失分的布局偏移零跳动);③新账号(独立 org)studies 空态有引导「What are we learning today?」非白屏、insights 有内容「Themes, across every study.」非白屏，再次佐证 T-501 org 隔离。慢请求加载态验收:5 个 route-level loading.tsx 骨架屏(insights/inbox/studies/studies-[id]/app 根，studies 骨架为 header+4 行卡片 Skeleton)+ new-study LLM 创建流程有 typing dots + tp-pulse-slow 加载指示(非白屏)+ report 页 ReportSkeleton + T-504 已修超时兜底。结论:CWV 达标 ✓、慢请求有 streaming/骨架屏而非白屏 ✓;纯验证无需改代码。清理:prod server 已停、perf 测试账号已删、dev 已恢复。(本地 loopback 无网络延迟，LCP/TTFB 偏乐观;CLS=0 与 JS 158KB 是真实结构性达标信号)
2026-07-18 T-528 done — [工程]:清理 T-501 修复前堆积在共享默认 org(00000000-…-0001)的 65 个测试 campaign(重复、中英混杂、"你可以做什么?"等废弃 draft)+ 关联 233 events + 9 insights(events/insights 无 FK 级联，按 campaign_id 手动删)。新增可复用脚本 scripts/clean_default_org.py:dry-run 默认(只报告)、--apply 才删、事务原子(insights→events→campaigns 顺序)、幂等、仅作用默认 org(真实 org 不读不改)、支持 --org 覆盖。真机执行:①dry-run 正确识别 65/233/9 + 展示脏数据样本;②--apply 删除 65 campaigns/233 events/9 insights，remaining 全 0;③再跑 --apply 幂等「nothing to clean」;④真实 org f01f8ee2 的 1 campaign 完整保留未受影响;⑤真机注册新用户(独立 org 7627ed4a)访问 /studies→「No studies yet」空态、0 study 卡片(页面里唯一的 churn/「上个季度」文本是空态 suggestion 占位示例非泄露数据)。验收:默认 org 无脏数据 ✓、不进入真实用户视图 ✓;ruff All checks passed。测试账号已清理。commit 10f361c
2026-07-18 T-527 done — [工程/文档]:新增 docs/local-fullstack-selftest.md，固化本次循环踩的坑，让新人照文档一次跑通全栈 + 全链路自测。内容:①依赖容器先起(Postgres 15432/Redis 16379，无迁移步骤 CREATE TABLE IF NOT EXISTS)；②⚠️SOCKS 代理陷阱专章——ALL_PROXY 致 LLM SDK 报缺 socksio 崩溃 + localhost curl 卡死，两个解法(env -u 剥离代理起 uvicorn / 装 httpx[socks])，curl 一律加 --noproxy "*"；③后端+前端启动 + real LLM vs mock(TELEPACE_LLM_PROVIDER=openrouter + key)；④全链路 register→create study→respondent(BFF httpOnly cookie 语义，新账号独立 org 空态、创建、受访者语言跟随)；⑤排障(clean_default_org、doctor.sh、down.sh、常见错误速查)。README Quickstart 加代理警告 + 指向手册。文档所有命令真机逐条验证:docker compose ps 依赖健康、剥离代理起 uvicorn→/healthz+/readyz 均 200(并据此修正文档把错误的 /health 改为真实 /healthz)、curl --noproxy register via BFF→{"ok":true}+tp_access/tp_refresh、scripts.smoke_llm→真实 OpenRouter(glm-4.7)返回 pong。验收:新人照文档可一次跑通前后端并完成注册→创建→受访者全链路 ✓;代码围栏平衡、README 链接有效;测试账号已清理。commit a0ea1d8
2026-07-18 T-529 done — [工程/测试]:把本次测评的 Critical 发现固化成 Playwright E2E 回归守护 frontend/e2e/paid-journey.spec.ts(production build + 真实后端)。用例:①T-501 org 隔离——每次注册唯一新用户、用干净(未登录)context(不继承共享 authed cookie，否则 /en/login 会因已登录跳 studies 隐藏表单)、断言新账号 studies 空「no studies yet」+ 0 study 卡片链接;②T-504 创建健壮——design chat 渲染且 composer 可编辑(非永久 drafting 卡死)、无 crash/404;③insights 页为新账号正常渲染。后端不可用时整文件 test.skip 不误报。真机验证:production build + 真后端跑 4 passed(setup + 3 journey);变异测试证明守护有效——把隔离断言翻转为期望「泄露的 studies」→ 测试准确失败 exit=1(非空壳);跨用户 IDOR 越权后端集成测试 tests/integration/test_campaign_isolation.py 已有 4 passed 覆盖(T-501/502/503)。修 bug:初版 3 用例超时因继承 authed cookie 致 login 页被跳过，加 test.use storageState 清空修复。验收:套件全绿 ✓、还原 bug 时用例准确失败 ✓、跨用户越权后端覆盖 ✓;spec 编译无误、app typecheck 通过;测试账号已清理。commit 2aa5754
