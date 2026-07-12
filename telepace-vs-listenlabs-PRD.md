# telepace × Listen Labs 深度对标与优化 PRD

> 版本 v1.0 · 2026-07-08
> 作者：产品分析（基于对两个产品逐屏实操对比）
> 对比对象：
> - **telepace**（本项目）— `http://localhost:3300`，Slogan：*Voice-native, Agent-first user research infrastructure*
> - **Listen Labs** — `https://listenlabs.ai`（已登录 workspace「telepace」，含 300 样本示例研究 *Gen Z ChatGPT Usage Study*）
>
> 说明：本文所有结论均来自对两个产品的**实际操作与截图观察**（含控制台报错日志），非推测。telepace 与 Listen Labs 属于同一品类：AI 驱动的用户研究 / 智能访谈平台。用户已在两边就"远程设计师显示器购买与色准溢价"做了**同题研究**，可直接同题对比。

---

## 0. TL;DR（给忙碌的人）

telepace 的**产品骨架与信息架构已经非常接近成熟形态**，甚至在若干"Agent-first / 语音优先 / 自托管 MCP"维度上比 Listen Labs 更激进、更有差异化叙事。但在**三条主链路上明显落后**：

1. **创建问卷**：Listen Labs 是"5 步引导 + 多轮领域感知追问 + 实时协同文档 + 变更追踪"；telepace 是"单栏聊天 + 右侧提纲"，且当前本地版本**创建流程直接崩溃**（`copyFor` 读 undefined + zh 语言包缺 `errors` 命名空间，loading 永久转圈）。
2. **分析系统**：Listen Labs 有"叙事报告 + 内嵌图表 + 交叉分析 + 行内证据引用 + Research Agent 对话 + 视频 Clips + 逐人质量分/自动分群/Bullet Summary"完整体系；telepace 目前是"洞察卡片 + verbatim"，缺图表、缺交叉分析、缺证据可追溯、缺响应级数据表。
3. **Agent 深度**：Listen Labs 的 agent 贯穿"建→追问→访谈追问→分析→跨研究"全链路且**全部带证据引用**；telepace 的 agent 目前更多停留在"生成"层，缺少可解释性（reasoning trace）与引用可追溯。

**telepace 的护城河机会**：语音/电话原生（Vapi）、自托管 MCP（把研究数据变成 Claude/Cursor 可调用的工具）、收件箱式 agent 主动升级（escalation）、BYO LLM Key。这些是 Listen Labs 目前没有强调的，应作为差异化主轴放大。

优先级：**先修复创建崩溃（P0）→ 补齐分析系统的图表与证据引用（P0/P1）→ 把 Research Agent 做成带引用的可解释 agent（P1）→ 放大语音/MCP/收件箱差异化（P1/P2）**。

---

## 1. 产品定位对比

| 维度 | telepace | Listen Labs |
|---|---|---|
| 一句话定位 | Voice-native, Agent-first user research **infrastructure** | AI-user interviews（AI 主持的规模化访谈） |
| 叙事重心 | 基础设施 / Agent 优先 / 语音优先 / 可编排 | 端到端"发起访谈→拿到洞察报告"的成品体验 |
| 目标用户气质 | 偏工程 / PMM / 可对接 Claude Code、Cursor、Codex | 偏研究员 / 产品 / 市场，开箱即用 |
| 差异化资产 | 自托管 MCP、BYO LLM、Vapi 电话外呼、收件箱式 agent 升级、Notion/Linear/Slack 深集成 | 成熟的叙事报告引擎、Research Agent、视频 Clips、Panel/受众规模、跨研究 Research Library |
| 视觉气质 | 编辑体 / 衬线大标题 / 米色暖底 / 克制留白（很"高级杂志感"） | 干净 SaaS 蓝 / 信息密度高 / 报告排版专业 |

**结论**：telepace 的定位与视觉是**加分项**，不要丢。差距主要在"成品链路的完成度"，而非"方向"。

---

## 2. 全流程逐环节对比

以下按一个研究的真实生命周期展开：**创建 → 受众 → 分发/渠道 → 访谈执行 → 分析 → 洞察沉淀/跨研究 → 集成**。

### 2.1 创建问卷（Study Creation）

**telepace 实测**（`/zh/studies/new`）：
- 左「Design Chat」+ 右「Discussion Guide」双栏，输入"想了解什么"，agent 起草提纲。
- 渠道选择：`web text / web voice / phone outbound / email`（语音/电话原生，✅ 亮点）。
- 顶部有「Simulate respondent」（模拟受访者）、「Publish study」。
- 顶部估算「~15 min · 10 completions」。
- **严重问题**：本地实操发送第一条消息后 loading 永久转圈，提纲无法生成。控制台确认根因（见 §7）。

**Listen Labs 实测**（`/create` → `/p/{id}/edit/chat`）：
- 起手有 4 类**示例模板**（Market Research / UX / Product Strategy / Concept Testing），并支持「Upload Discussion Guide」（导入已有提纲）与「Skip Guided Setup」（手动）。
- 进入 **5 步引导向导**（Step 1/5 起）：目标 → 受众 → 问题 → 欢迎页 → Review。
- Agent **多轮领域感知澄清**：先问"这个研究要支撑什么决策？"给出**上下文相关的多选**（如"我们销售的高端色准显示器定价/定位"），再自动：
  - 生成研究标题（"Remote Designers: Monitor Buying & Color Accuracy Premium"）；
  - 起草 Study Goals + 4 条结构化 Key questions；
  - 追问"是否针对特定设计师类型（UI/UX/摄影/印刷）？谁付费（自费 vs 公司报销）？"。
- **实时协同文档**：右侧文档随对话更新，显示「Updated study guide (2 changes)」**变更追踪/可展开 diff**。
- 文档结构完备：Language（+ 多语言翻译 + 语音）、Study Goals、Audience、Welcome screen（欢迎语 + 同意勾选 + 字数计数 55/500）、分区式问题（Section 有类型如"Concept testing"，每题可加 **AI 追问 follow-ups**、Open-ended 等题型）、Closing message、Reward respondents、Redirect on complete。
- 顶部工具条：Create/Review 两阶段、自动保存（Just saved）、撤销/重做、版本历史、翻译、预览播放、下载、设置。

**差距小结（创建）**：

| 能力 | telepace | Listen Labs |
|---|---|---|
| 双栏实时提纲 | ✅ | ✅（更结构化） |
| 语音/电话渠道 | ✅✅（4 渠道） | 偏文本/视频 |
| 模拟受访者 | ✅ | ✅（Preview 播放） |
| 引导式向导（分步） | ❌ 单轮 | ✅ 5 步 |
| 领域感知多轮追问 | ❌（本地崩溃，无法验证） | ✅ 强 |
| 变更追踪 / diff | ❌ | ✅ |
| 版本历史 / 撤销重做 | ❌（未见） | ✅ |
| 导入已有提纲 | ❌（未见） | ✅ Upload Guide |
| 示例模板库 | 有 3 条 suggestion | ✅ 分类模板 |
| 每题 AI 追问配置 | 未见显式配置 | ✅ per-question follow-ups |
| 欢迎页/同意/结束页/奖励/跳转 | 未见 | ✅ 完整 |
| 多语言 + 翻译 | zh 已有但**语言包不全**（报错） | ✅ Add translations |

### 2.2 受众（Audience）

**telepace**（`/zh/audience`）— 实测**优于** Listen Labs 的可见部分：
- 分群（Segments）：`Pro trial (Stripe · auto-sync)`、`Churned in Q2 (CSV)`、`Beta researchers (Manual · vetted)`。
- 每个分群显示**送达→打开→完成漏斗**（如 Pro trial：已送达 380 / 已打开 220 / 已完成 68）。
- CSV 导入 + 同步记录（synced 状态）、Stripe 自动同步。

**Listen Labs**：受众在创建向导内作为一步（"Your target audience will be displayed here"），并有 Panel（外部受众池，示例研究 300 样本、150 被 screened out）。dashboard 未见独立的分群漏斗管理页。

**小结**：telepace 的**自有受众 CRM + 漏斗**是优势，应保留强化；但缺 Listen Labs 那种**外部 Panel 供给 + 招募**能力（自己没有受众时谁来答）。

### 2.3 分发 / 渠道

- **telepace**：分享链接（`/r/{id}`）+ Copy link + Preview；渠道覆盖 web text / voice / phone / email；Resend 邮件 + Vapi 电话外呼（`+1 415 555 0134`）。**电话外呼是强差异化**。
- **Listen Labs**：分享链接、Reward respondents、Redirect on complete、Panel 招募；偏 web/视频访谈。

### 2.4 访谈执行（Interview Agent）

- **telepace**：live 研究「显示器色准」1/10 完成；「收件箱」显示 agent 在访谈中做了实时动作 —— *"Interview 048 flagged distress signals — auto-closed"*（识别受访者压力信号并自动关闭待人工复核）、*"Reached 24/24 completions, auto-closes tomorrow"*（达标自动收尾）。**这类"agent 主动升级 + 自动运营"是 telepace 的独特叙事**。
- **Listen Labs**：per-question follow-ups 配置（访谈中 AI 自动追问）；responses 有逐人质量分（Excellent/Good）、平均 15min22s / 1265 词 —— 说明访谈 agent 追问深度高、产出长文本。

**小结**：两边访谈 agent 都强，但**可观测性不同**：telepace 用"收件箱"沉淀 agent 决策（好），Listen Labs 用"质量分 + 追问深度"体现结果（好）。建议 telepace 把两者结合。

### 2.5 分析系统（Analysis）— **差距最大的一环**

**telepace**（study 详情 + `/zh/insights`）：
- study 详情：Completed/In progress/Median length/Insights 四个统计；INSIGHTS 卡片（`theme`/`concern` 标签 + 置信度 85%/90%/95%）；verbatim 原声引用；Discussion guide（每题带 Goal）；Setup / Target persona / Hypotheses(H1–H4)。
- 跨问卷「洞察」页：分类标签（pricing/onboarding/expansion）+ 置信度分值 + "N 条支持性引述" + 忽略 + **推送到 Notion**。

**Listen Labs**（示例研究 Report/Responses/Chat/Clips）：
- **Report**：论点式标题的**完整叙事报告**（"How Gen Z Actually Uses AI: A Utility, Not a Friend"）；左侧目录锚点；Executive Summary + 分节论证；**内嵌图表**（条形图、按性别/使用频率的**交叉表**）；统计严谨性（N= 基数、T2B top-2-box、多选占比 >100% 提示、"小样本谨慎解读"）；**行内可点击的证据引用**（数字 476/192/437 → 跳到具体受访者原话）；内嵌**视频 reel**；结尾"Implications for Product Teams"行动建议；可下载。
- **Responses**：数据表 —— 299 完成（+150 screened out）、平均时长/字数、**Response Quality = Excellent**（68% Excellent / 32% Good）；每行含**自动质量分、自动分群标签**（18-21 / ChatGPT / Daily Users / AI Enthusiasts…）、**AI 逐人 Bullet Summary**、URL 参数；可搜索/筛选/导出。
- **Chat（Listen Research Agent）**：基于研究数据的对话式 agent；预设问题（矛盾点/关键结论/意外发现/分群对比/主题/精彩引用）；回答**先展示可展开的 reasoning trace（"Analyzed the responses"）**，再给带百分比 + **行内图表引用 + 受访者编号引用**的结构化结论；支持多会话历史。
- **Clips**：**按主题自动剪辑的视频合集**（"最难过的时刻/最后一次 AI 交互/为何选择 ChatGPT"…），把受访者视频片段按主题拼接成 reel。

**差距小结（分析）**：

| 能力 | telepace | Listen Labs |
|---|---|---|
| 洞察卡片 + 置信度 | ✅ | ✅（融入报告） |
| verbatim 原声 | ✅ | ✅（可点击回溯到人） |
| **叙事报告（可读长文）** | ❌ | ✅✅ |
| **内嵌图表 / 交叉分析** | ❌ | ✅✅ |
| **统计严谨性（N/T2B/小样本告警）** | ❌ | ✅ |
| **证据可追溯（点引用→原话）** | ❌ | ✅✅ |
| **响应级数据表** | ❌ | ✅ |
| **逐人质量分 / 自动分群 / Bullet Summary** | ❌ | ✅ |
| **对话式分析 Agent（带引用）** | ❌ | ✅✅ |
| **视频 Clips 自动剪辑** | ❌（渠道偏语音/文本） | ✅ |
| 跨研究分析 | ✅ 静态洞察页 | ✅ Research Library（会话式生成图表） |
| 推送到 Notion/Linear | ✅✅（强集成） | 未突出 |
| 导出 | 未见（study 详情无导出） | ✅ Export Responses / 下载报告 |

### 2.6 洞察沉淀 / 跨研究

- **telepace**：`/zh/insights` 跨问卷主题聚合（静态卡片）+ 推送到 Notion；收件箱周报"3 studies progressed and 2 new themes surfaced"。
- **Listen Labs**：Research Library —— *"Generate charts across studies"*，可选 All studies / Select studies，预设"跨所有研究找最惊人的 5 个结论 / 对比最近 3 个研究写 memo / 用户最爱的 5 点"等，**会话式跨研究 agent**。

**小结**：方向一致，但 Listen Labs 把跨研究做成了**会话式、可生成图表/ memo 的 agent**；telepace 是静态聚合 + Notion 推送。telepace 可保留 Notion 推送优势，同时把跨研究做成对话式。

### 2.7 集成（Integrations）— telepace **领先**

telepace（`/zh/integrations` + 设置/MCP）远比 Listen Labs 可见部分丰富：
- Insight Destination：**Notion**（同步到 Research 库）；Issue Tracker：**Linear**（每主题一 issue）；Notifications：**Slack**；**Custom Webhooks**；**BYO LLM Key**（Anthropic 已连 / OpenAI 待连）；Voice：**Vapi**；Email：**Resend**。
- **自托管 MCP**：`https://mcp.telepace.io/w/{workspace}`，API Key 认证，兼容 Claude Desktop / Claude Code / Cursor / Codex。→ **把研究数据变成 agent 可调用的工具，是 Listen Labs 未强调的强差异化。**
- 设置含工作区/成员（Owner/Editor/Viewer）/账单（Pro $79/mo，用量：14 问卷 / 312·500 完成 / 48min 语音）/API Key/危险操作。

---

## 3. telepace 的功能缺口清单（Feature Gaps）

按"必须补齐 → 应该补齐 → 差异化加分"排序。

### 3.1 必须补齐（对标基线，缺了就"不完整"）
1. **创建流程崩溃修复**（见 §7，P0，阻断级）。
2. **分析报告引擎**：把洞察卡片升级为"可读叙事报告 + 内嵌图表 + 章节"。
3. **图表与交叉分析**：至少条形/占比图 + 按分群（年龄/角色/渠道/使用频率）的交叉表。
4. **证据可追溯**：报告/洞察里的每个数字与引用可点击回溯到"具体受访者 + 原话片段"。
5. **响应级数据表**：逐人列表（时长、质量分、分群标签、Bullet Summary、筛除原因）+ 搜索/筛选/**导出**。
6. **统计规范**：显示 N（基数）、多选提示、小样本告警、Top-2-Box 等，避免"看起来精确实则误导"。
7. **多语言语言包补全**：zh 缺 `errors` 命名空间导致运行时报错。

### 3.2 应该补齐（体验完整度）
8. **创建向导化**：分步（目标→受众→题目→欢迎/同意→结束→Review）+ 领域感知多轮追问。
9. **变更追踪 + 版本历史 + 撤销/重做**：创建/编辑的每步可回溯。
10. **导入已有提纲 / 模板库**：Upload Guide + 分类模板起手。
11. **每题 AI 追问（follow-ups）显式配置**：控制访谈 agent 的追问深度/上限。
12. **欢迎页 / 同意勾选 / 结束语 / 奖励 / 完成跳转** 的可视化配置。
13. **对话式分析 Agent**（Research Agent 对标）：对单个研究问答，带 reasoning trace + 引用。

### 3.3 差异化加分（放大 telepace 独有优势）
14. **收件箱式 agent 主动升级**：已有雏形，做成体系（escalation/insight/progress/system 分类 + 一键操作）。
15. **语音/电话原生分析**：语音特有的分析维度（情绪、停顿、语速、可播放音频片段 + 转写对齐）。
16. **音频/视频 Clips**：即使以语音为主，也能做"按主题自动剪辑的音频高光片段"。
17. **MCP 工具化研究数据**：把"查询洞察/导出片段/发起研究"暴露为 MCP 工具，主打"研究即 agent 能力"。
18. **外部受众供给**：自有 CRM 之外，接入 Panel/招募渠道，解决"没有受众"的冷启动。

---

## 4. UI / 审美 / 交互 优化建议

> telepace 的视觉基调（衬线大标题、米色暖底、克制留白、编辑杂志感）是**明显的加分项**，以下建议在"不破坏这套气质"的前提下提出。

### 4.1 审美 / 视觉
- **保留并强化**编辑体气质：大标题衬线 + 大量留白 + 低饱和色板，这是与 Listen Labs（标准 SaaS 蓝）的差异化视觉资产，别向通用 SaaS 回归。
- **数据可视化缺失**是当前最大审美短板：纯文字洞察在"信息密度/说服力"上不如 Listen Labs 的图表报告。需要一套**与米色暖调一致的图表主题**（低饱和、细线、衬线数字），而不是套用蓝色默认图表库。
- **空状态与骨架屏**：studies 列表加载态是灰块骨架（OK），但很多页（洞察/分析）缺"有质感的空状态插画/引导"。
- **置信度可视化**：telepace 已有置信度条（85%/90%），但缺"这个置信度基于多少条证据/多少人"的语境，视觉上应把"分值 + 基数 + 可点击证据"三合一。

### 4.2 交互 / 体验
- **错误处理体验（P0 体验债）**：创建页崩溃后**没有任何用户可见的错误提示**（只在控制台报错，UI 永久 loading）。必须：① 错误兜底文案；② loading 超时；③ 重试按钮。
- **创建的引导感**：当前单栏聊天对"第一次用"的用户过于开放，缺少 Listen Labs 那种"分步 + 多选 + 追问"的手把手感。建议引入引导向导 + 上下文多选。
- **证据的可点击性**：Listen Labs 报告里"数字/引用可点击回溯"极大增强信任感；telepace 的 verbatim 目前是静态文本，应可点击展开完整访谈上下文。
- **报告的可导航性**：长报告需左侧目录锚点 + "回到顶部"（Listen Labs 已有）。
- **模拟受访者的显性化**：telepace 已有「Simulate respondent」，可做成"发布前用 AI 跑 3 个模拟受访者预览访谈质量"的闭环。
- **一致的操作反馈**：自动保存态（"Just saved"）、同步态（synced）telepace 部分页已有，建议全局统一。
- **i18n 一致性**：产品混用中英（侧栏中文、标题英文"What are we learning today?"、渠道英文）。要么彻底双语切换，要么在 zh 下统一中文，避免"半汉化"观感 + 修复语言包报错。

### 4.3 信息架构（IA）
- telepace 侧栏（问卷/收件箱/受众/洞察 + 工作区：集成/设置）**清晰且优于** Listen Labs（Studies/Research Library/Workspace/Usage/Account）。收件箱作为一级入口是亮点，保留。
- 建议在 study 详情内补齐"Report / Responses / Chat / Clips"式的**分析子标签**，把分析能力聚合到单个研究下（目前 telepace 的分析散在 study 详情 + 全局洞察页）。

---

## 5. Agent 能力对比与改进

### 5.1 现状对比

| Agent 场景 | telepace | Listen Labs |
|---|---|---|
| 建研究（起草提纲） | 有（本地崩溃）；单轮 | 强；多轮领域感知追问 + 协同文档 + diff |
| 访谈中追问 | 有（收件箱见实时动作/压力信号识别） | 强；per-question follow-ups + 深度长回答 |
| 访谈运营（自动收尾/升级） | ✅ 独有（收件箱 escalation） | 未突出 |
| 单研究分析问答 | ❌ | ✅ Research Agent（reasoning trace + 引用） |
| 跨研究分析 | 静态聚合页 | ✅ Research Library 会话式生成图表 |
| 可解释性（reasoning trace） | 未见 | ✅ "Analyzed the responses" 可展开 |
| 引用可追溯 | verbatim 静态 | ✅ 数字引用→原话/图表 |
| Agent 可被外部调用 | ✅ MCP（独有） | 未突出 |

### 5.2 telepace 的 Agent 可改进点
1. **补"单研究 Research Agent"**：对话式问答（矛盾/主题/分群对比/精彩引用），**回答必须带引用**（→ 具体受访者 + 原话 + 图表），并展示 reasoning trace。
2. **建研究 agent 引导化**：从"单轮起草"升级为"多轮领域感知澄清"（决策用途→受众细分→谁付费→题目→追问深度），每轮给上下文相关多选。
3. **引用/证据基础设施**：建立"claim ↔ evidence"数据结构（每个洞察/数字挂 N 条证据 id），这是报告可追溯、agent 可引用、置信度可解释的**共同底座**——一次投入，三处受益。
4. **可解释性**：所有生成结果（洞察/报告/回答）附"基于 X 条访谈 / Y 条引用 / 置信度 Z"，并可展开推理。
5. **访谈 agent 的"研究员纪律"**：追问要覆盖 study goals 的每条 Key question、控制时长、识别敷衍/矛盾/压力信号（压力信号已有雏形，扩展为完整"访谈质量守护"）。
6. **Agent 动作可审计**：收件箱已是好载体，补"agent 为什么这么做 + 允许人工撤销/覆盖"。

### 5.3 Listen Labs 的 Agent 可改进点（供 telepace 反向借鉴/避坑）
1. **Agent 动作缺"主动运营/升级"层**：Listen Labs 的 agent 偏"被动响应"（你问它答、你配它跑），缺 telepace 收件箱那种"agent 主动发现问题并升级给人"的运营闭环 → telepace 应把这点做成核心叙事。
2. **可编排性弱**：未见 BYO LLM、MCP、Webhook 等"把 agent 接进你自己工作流"的能力 → telepace 的 MCP/集成是反超点。
3. **语音/电话深度**：Listen Labs 偏 web/视频，语音/电话原生分析（情绪/语速/音频片段）是 telepace 可独占的 agent 维度。
4. **跨研究 agent 的落地闭环**：Research Library 生成图表/ memo 后，缺"一键落到 Notion/Linear/issue"的闭环 → telepace 的 Notion/Linear 集成可补上这一环形成完整回路。

### 5.4 "最智能问卷/访谈系统"的 Agent 设计蓝图

一个真正智能的系统应该是**一支端到端的 AI 研究团队**，由多个专职 agent + 一个统一的证据底座 + 一个人机协作界面组成：

**A. 统一证据底座（Evidence Graph）—— 一切智能的地基**
- 数据模型：`Respondent → Interview → Turn(问答对/音频段) → Claim(洞察/数字) → Evidence(引用 id)`。
- 每个洞察、每个百分比、每句报告结论都**可追溯到具体证据**，且带基数 N 与置信度。
- 这是报告可追溯、agent 可引用、置信度可解释、跨研究可聚合的**共同底座**。

**B. 五个专职 Agent（沿研究生命周期）**
1. **Designer Agent（设计师）**：领域感知多轮澄清 → 生成 goals + 分区题目 + 每题追问策略；协同文档 + 变更追踪；发布前用"模拟受访者"自检访谈质量。
2. **Interviewer Agent（主持人）**：实时自适应追问，覆盖每条 Key question、控时、识别敷衍/矛盾/压力信号、动态分支；语音/电话/文本多模态一致体验。
3. **Analyst Agent（分析师）**：把原始访谈→叙事报告 + 图表 + 交叉分析 + 逐人质量分/分群/摘要；**所有产出挂证据**；给统计告警（小样本/多选）。
4. **Copilot Agent（研究助手）**：对单研究/跨研究对话式问答，带 reasoning trace + 引用；可生成 memo、对比研究、找矛盾/异常/金句。
5. **Ops Agent（运营/升级）**：主动监控（达标自动收尾、质量下滑、压力信号、异常分群），通过"收件箱"升级给人并附建议动作；周报/digest。

**C. 人机协作层（Human-in-the-loop）**
- 收件箱式 escalation（telepace 已有雏形）：agent 主动发现 → 升级 → 人一键确认/覆盖，全程可审计。
- 一切 agent 动作"可解释 + 可撤销 + 可覆盖"。

**D. 可编排 / 开放层（telepace 独有优势放大）**
- **MCP 工具化**：把"发起研究 / 查询洞察 / 导出证据片段 / 触发分析"暴露为 MCP 工具，让 Claude Code / Cursor / 用户自己的 agent 直接调用 telepace 的研究能力。
- **BYO LLM + Webhook + Notion/Linear/Slack 闭环**：洞察自动落到工单/文档/频道，形成"研究→行动"回路。

> 一句话：**Listen Labs 把 agent 做成了"你能调用的研究工具箱"；telepace 应该把 agent 做成"会主动干活、可被你的其他 agent 调用、且每句话都有出处的研究团队"。** 证据底座 + 收件箱运营 + MCP 开放，是 telepace 区别于 Listen Labs 的三根支柱。

---

## 6. 优先级路线图（Roadmap）

### P0 — 阻断 / 基线（1–2 周）
- [ ] **修复创建流程崩溃**：`src/lib/errors.ts` 的 `copyFor` 对未知错误码兜底（不再读 undefined.title）；`handleSend` 失败时重置 loading + 展示错误 + 重试。
- [ ] **补全 zh 语言包 `errors` 命名空间**，消除 `MISSING_MESSAGE` 运行时报错。
- [ ] **创建失败的用户可见反馈**（错误文案 + loading 超时 + 重试）。

### P1 — 对标基线补齐（3–6 周）
- [ ] **分析报告引擎**：洞察 → 叙事报告（章节 + 目录锚点 + 可下载）。
- [ ] **图表 + 交叉分析**（与米色主题一致的图表皮肤）+ 统计规范（N/多选/小样本告警）。
- [ ] **证据底座（Evidence Graph）**：claim↔evidence 可追溯，报告/洞察引用可点击回溯到人。
- [ ] **响应级数据表**：逐人质量分/分群标签/Bullet Summary/筛除原因 + 搜索/筛选/导出。
- [ ] **单研究 Research Agent**：对话式问答，带 reasoning trace + 引用。
- [ ] **创建向导化**：分步 + 领域感知多轮追问 + 变更追踪 + 版本历史。

### P2 — 差异化放大（6–12 周）
- [ ] **收件箱运营 agent 体系化**（escalation/insight/progress/system + 一键动作 + 可审计）。
- [ ] **语音/电话原生分析**（情绪/语速/音频片段回放 + 转写对齐）+ 音频 Clips 自动剪辑。
- [ ] **MCP 研究工具化**（发起研究/查询洞察/导出片段暴露为 MCP 工具）。
- [ ] **跨研究 Copilot**（对标 Research Library）+ 一键落 Notion/Linear 闭环。
- [ ] **外部受众供给 / 招募**，解决冷启动。
- [ ] **i18n 一致性**（彻底双语或统一中文）。

---

## 7. 已发现的真实 Bug（证据留档）

以下均来自 telepace 本地实操时的浏览器控制台（`localhost:3300`），非推测：

1. **i18n 缺失（多页）**
   ```
   IntlError: MISSING_MESSAGE: Could not resolve `errors` in messages for locale `zh`.
     at StudiesPage (src/app/[locale]/(app)/studies/page.tsx:46)
     at NewStudyPage (src/app/[locale]/(app)/studies/new/page.tsx:77)
   ```
   → zh 语言包缺 `errors` 命名空间。

2. **创建流程致命异常（阻断级）**
   ```
   [EXCEPTION] TypeError: Cannot read properties of undefined (reading 'title')
     at copyFor (src/lib/errors.ts:52)
     at friendlyMessage (src/lib/errors.ts:59)
     at handleSend (src/app/[locale]/(app)/studies/new/page.tsx:236)
   ```
   → 复现：在 `/zh/studies/new` 输入研究目标并发送 → agent 起草请求失败 → 错误映射函数 `copyFor` 对未知错误码读取 `undefined.title` 再次抛错 → loading 永久转圈、提纲无法生成、UI 无任何错误提示。
   → 根因链：**起草请求失败** + **错误处理自身崩溃** + **缺 i18n 兜底**，三者叠加。这是 P0，直接阻断"创建问卷"这条核心链路。

---

## 附录 A：对比数据速查

- **Listen Labs 示例研究**：*Gen Z ChatGPT Usage Study*，N=299 完成（+150 screened out），平均 15min22s / 1265 词，质量 68% Excellent / 32% Good。
- **telepace live 研究**：显示器色准溢价，1/10 完成，8 条洞察（theme/concern，置信度 85–95%）。
- **telepace 套餐**：Pro $79/mo；用量 14 问卷 / 312·500 完成 / 48min 语音。
- **telepace 集成**：Notion / Linear / Slack / Webhooks / BYO LLM(Anthropic·OpenAI) / Vapi / Resend / 自托管 MCP。

## 附录 B：本次对比的操作范围与边界
- 已实操：telepace 全侧栏板块 + study 详情 + 创建流程（触发并定位崩溃）；Listen Labs dashboard + 示例研究 Report/Responses/Chat/Clips + 创建向导（走到 Step 1 多轮追问，生成标题与 goals）+ Research Library。
- 边界：未发布/分发任何问卷给真实受众（避免发送消息与消耗付费额度）；分析系统基于 Listen Labs 已有 300 样本示例研究观察。
- 在 Listen Labs 创建了一个**草稿**研究用于观察创建流程（未发布）。
