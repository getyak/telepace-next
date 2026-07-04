# Listen Labs 竞品分析（作为"要超越"的基线）

> 来源：2026-07-03 抓取 listenlabs.ai 首页 / 案例 / 分享报告页

## 1. 定位与核心叙事
- 一句话价值主张：**"Understand what people want, and why. Fast."**
- 副标题：AI researcher finds participants, conducts in-depth interviews, and delivers actionable insights in **hours, not weeks**.
- 关键数字锚点：3× 长回答 · 14h 内出结果 · 10M+ 潜在受访者 · 50+ 语言 · SOC2/GDPR

## 2. 信息架构（IA）
四步流程（首页核心图卡）：
1. **Create your study** — "AI helps you go from idea to implemented discussion guide in seconds"
2. **Listen recruits participants** — 30M+ global panel
3. **AI-moderated interviews** — probes deeper with follow-ups
4. **Results delivered overnight** — themes / highlight reels / slides

产出物顶栏 Tab：**Responses / Report / Details / Chat / Clips**（这是我们要抄+超越的报告 IA）

## 3. Use Cases（他们的 6 个场景，也是我们 10 个用户故事的基础）
- Brand Tracker
- Usability Testing
- Multi-Market Segmentation（100+ languages）
- Concept Testing
- Consumer Journey Map
- Creative Testing

## 4. 视觉/审美（我们要打的靶）
- 字体族：**Inter**（+ Inter Fallback）— 干净、中性、企业友好
- 主色：白底 `#FFF` + 纯黑 `#000` 文字 + 蓝色链接 `rgb(0, 34, 255)`（近电子蓝）
- 灰阶：`rgba(0,0,0,.03/.04/.1/.16/.25/.4/.5/.6/.9)` —— 大量透明黑做分层
- 中性面板底：`#F9F9F9` / `#F7F7F7`
- 视觉风格：**极简高对比 + Editorial 学术感**（Harvard research 血统的暗示）
- 首屏动效：一个"用户悬停卡片"，实时冒出访谈中的关键词/情感评分（social proof + 智能感演示）
- 客户 Logo 列表用大网格灰度墙（60+ logos）

## 5. 交互亮点（AI 智能感如何被"演出来"）
- 首页 hero 卡片直接把 AI Interviewer 的"追问台词" + 分类评分显示出来（不需要点击进去）
- Report 页用**编辑体（Editorial）**长文标题："How Gen Z Actually Uses AI: A Utility, Not a Friend" → 智能感来自**能提炼观点**，不是罗列数据
- 各章节 H2 是**判断句而非中性标签**（"ChatGPT Wins by Default, Not by Design"）— 让 AI 显得有 POV
- 数据用大字号原生排版而不是花哨图表（"94% used ChatGPT in the past month"）

## 6. 我们要超越的 3 条战线
| 维度 | Listen Labs 现状 | telepace 目标 |
|---|---|---|
| **智能感** | Study 创建阶段（Step 01）承诺"seconds from idea to guide"，但演示较薄 | 让"创建问卷"本身成为一场令人惊艳的对话：AI 主动提问、推断目标人群、生成筛选题、可实时预览假想受访者的回答 |
| **体验** | 报告 tab 结构清晰，但首屏"设计问卷 → 招募 → 访谈 → 报告"是**串行**呈现 | 一体化画布：左对话 + 右实时问卷卡片 + 底部"假想受访者试跑"抽屉，三者同步呼吸 |
| **审美** | 极简 Editorial（安全牌）、Inter + 白底黑字 | 与 Editorial 同级但更有当代感：**Neutral 底 + 单色高饱和 accent + 微动效反馈 + 有意识的负空间**；夜间模式一等公民 |

## 7. 我们的差异化"武器"（对应 telepace 现有基座）
- 已有 **SSE `refine/stream`**：可实现"边聊边生成、边生成边可试跑"
- 已有 **Anthropic + OpenRouter 双通道**：可为不同 agent 分配不同模型（评分 agent 用不同"评委"减少同源偏差）
- 已有 **CampaignSpec 结构**：`goal / background / hypotheses / target_persona / audience_screener / outline / channels / target_completions / budget_usd / languages` — 字段远比 listenlabs 首屏展示的丰富，我们要把这些"变成 AI 主动补齐"的字段
- 已有 **Turn / Insight / OutlineItem 分层模型**：可支持"AI 试跑受访者"回放 + 逐题智能感评分
- 现有 **ChatFeed / ChatComposer / VoiceOrb** UI 组件：审美升级的直接施力点

## 8. 待补齐（差距清单）
- 初始 outline 目前是**前端硬编码 5 题**，不是 LLM 生成的 → 必须替换
- `onPatch` 目前只应用 `outline.items`，其它字段（persona / screener / hypotheses）被静默丢弃 → 必须补齐
- Study 详情页完全 mock → 必须接真数据 + Editorial 报告样式
- Publish 按钮无 `onClick` → 必须接 `startCampaign`
- 无试跑受访者、无实时预览、无审美感的报告页 → 全新
