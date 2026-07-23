# Open Design × telepace 集成分析与设计稿

> 分析对象:[nexu-io/open-design](https://github.com/nexu-io/open-design)(Apache-2.0)——
> "Claude Design 的开源替代",把本地 coding agent 变成设计引擎(原型/仪表盘/PPT/图片/视频)。
> 日期:2026-07-23 · 状态:Draft v1

---

## 0. TL;DR

Open Design **不是一个可以嵌进 telepace 产品的库**——它是一个"daemon + 本地 agent 编排"的桌面/自托管工具,自带 Web UI、Electron 壳、SQLite、26 个 runtime。把它整个塞进 telepace 的 SaaS 架构既不可行也没必要。

真正值得拿的是它的**四个可拆解资产**,按 ROI 排序:

| # | 资产 | 集成方式 | 服务的 telepace 场景 |
|---|------|----------|---------------------|
| A | **DESIGN.md 品牌契约格式** | 抄格式,写一份 telepace 自己的 `DESIGN.md` | 开发工作流:让 Claude Code 等 agent 生成的 UI 天然符合品牌 |
| B | **deck / prototype 设计模板(SKILL.md 生态)** | 选择性 vendor 到 `.claude/skills/` | 研究报告 → 客户可分享的 deck/单页报告(产品功能!)|
| C | **`od mcp install claude` 开发期接入** | 本地安装,零代码 | 你个人的设计-开发迭代提速 |
| D | **artifact 沙箱预览 + 导出管线思路** | 参考实现,不引依赖 | 未来 insight 报告导出 PDF/PPTX 时抄作业 |

其中 **B 是唯一触达 telepace 产品本身的集成**——它与 PRD 里 "insights 交付"(推 Notion/Slack/email)方向天然衔接:研究员点一下,把 analyst 的 themes/verbatims/persona 渲染成一份品牌化的可分享报告。A 和 C 是开发效率杠杆,当天可落地。

---

## 1. Open Design 是什么(架构速读)

```
┌─ Desktop App / Web UI (Next.js 16 + Electron) ─┐
│                                                 │
│  ┌── Daemon(Node 24 + Express + SQLite)──────┐ │
│  │  /api/skills  /api/design-templates        │ │
│  │  /api/plugins /api/design-systems          │ │
│  │  /api/chat(SSE) /api/proxy/*(BYOK 网关)  │ │
│  │  /api/artifacts/{save,lint}                │ │
│  └──────────┬─────────────────────────────────┘ │
│             │ 26 个 runtime 定义                 │
│      spawn 本地 CLI:claude / codex / cursor ... │
└─────────────────────────────────────────────────┘
   素材层(纯文件,无运行时依赖 ←★ 可拆解):
   - design-systems/<brand>/DESIGN.md + tokens.css + manifest.json(151 个)
   - design-templates/*/SKILL.md(deck/prototype/image/video 蓝图)
   - skills/*/SKILL.md(Anthropic Agent Skills 规范)
   - plugins(277 官方 + 183 示例)
```

关键洞察:**它的智能全部来自你已装的 coding agent,它自己只提供"素材 + 编排 + 预览 + 导出"**。素材层是纯 Markdown/CSS/JSON 文件,遵循 Anthropic 的 SKILL.md 公开规范——这意味着素材可以脱离 daemon 单独使用,直接被 Claude Code 消费。这就是拆解的合法性基础(Apache-2.0,注意 bundled 组件如 guizang-ppt 是 MIT,保留原 license 即可)。

## 2. 为什么不整体集成(排除项)

| 方案 | 排除理由 |
|------|----------|
| 把 daemon 跑在 telepace 服务端,产品调它的 API | daemon 设计为 loopback-only 单用户本地工具(SQLite、spawn 本地 CLI、SSRF 防护假设单机);多租户 SaaS 语义完全不符,等于在服务器上运行任意 CLI——安全模型不可接受 |
| 前端嵌它的 Web UI | Next 16 vs 15、它是完整 app 不是组件库、视觉语言(通用)与 telepace(editorial 暖纸+衬线)冲突 |
| 用它的 BYOK proxy 代替 agents/shared/llm.py | telepace 已有 OpenRouter 三档模型抽象 + 计费,proxy 是倒退 |

## 3. 四个集成方案详细设计

### A · DESIGN.md 品牌契约(1 小时,当天落地)

telepace 已经有一套异常克制、注释良好的 design token(`frontend/packages/ui/src/tokens.ts`:paper/ink 阶梯、sage accent、serif display,"editorial, quiet luxury")——但它只存在于 TypeScript 里,**任何 AI agent 生成 UI 时都读不到设计意图,只能读到十六进制值**。

Open Design 的核心论点正是:把品牌契约写成一份 agent 可读的 `DESIGN.md`,每次渲染前注入。抄这个格式:

```
新文件 frontend/DESIGN.md(≤ 200 行):
  ## Identity     — editorial / quiet luxury / Listen Labs+Anthropic 参照
  ## Color        — paper 阶梯语义(desk 的"letter-on-a-desk"隐喻)、
                    四级 ink 阶梯的对比度契约、accent 使用纪律、terracotta=警示
  ## Type         — display serif 只用于 h1/h2、body Inter、编号纪律
  ## Radii/Shadow — input 4 / button 8 / card 12 / bubble 18 的语义,hairline 优先
  ## Components   — 现有 13 个组件(Button/Card/Chat…)的选用规则
  ## Anti-patterns— 禁纯白背景、禁彩色渐变、禁重阴影、表格宽度纪律
```

然后在 `CLAUDE.md` 里加一行:"改动 frontend UI 前必读 `frontend/DESIGN.md`"。tokens.ts 里那些高质量注释("desk 要让卡片被感到'放在'某物上"、"faint 永不承重")本身就是 DESIGN.md 的初稿素材。

**收益:** 所有 agent(Claude Code、未来 CI 里的 review agent、方案 B 的报告生成)共享同一份品牌真相;这也是 Open Design 生态的通行证——telepace 品牌可以直接作为一个 design-system 包丢进任何 Open Design 安装。

### B · 研究报告 → 品牌化可分享 deck / 单页(产品功能,~1 周)

**这是唯一改变 telepace 产品能力的集成。** 现状:analyst 产出 themes/verbatims/persona/report(结构化 JSON),交付渠道是推 Notion/Linear/Slack/webhook/email——全是"数据搬运",没有一个**面向研究员的老板/客户的、开箱即分享的视觉产物**。Listen Labs 竞品分析里这类 "shareable report" 恰是常见卖点。

Open Design 的 deck 模板(15+ 模板、36 主题)和单页 prototype 模板解决的正是"结构化内容 → 品牌化 HTML"这一步。集成路径**不引入 daemon**,而是拆素材自建轻管线:

```
1. 挑 1 个 deck 模板 + 1 个单页报告模板,vendor 进
   agents/analyst/report_templates/(保留原 MIT/Apache 声明)
2. 模板的 SKILL.md 指令 + telepace DESIGN.md(方案 A)+ analyst JSON
   → 交给现有 llm_model_heavy 一次生成 self-contained HTML
3. 新事件 report.generated + artifact 存储(S3 字段 settings 里已预留)
4. 新端点 GET /v1/campaigns/{id}/report.html(带签名 token 的分享链)
5. 前端 insights 页加 "Generate shareable report" 按钮
6. PDF 导出 = 浏览器打印(Open Design 同款思路,零新依赖);
   PPTX 留待后续(它用的 agent-driven 方案较重)
```

**与既有系统的咬合点:**
- 生成走 Harness 命令(`generate_report`)→ 复用 PolicyStack/事件溯源/tracing;
- 计费:报告生成算 heavy 模型调用,天然落在刚建好的 usage 观测习惯上,未来可作为 Pro 差异化功能(Free 无 branded report);
- 前一份设计稿(agent-loop-gap-analysis)的 C2 artifact 存储,与这里的 report artifact 是**同一张表**——两个设计稿可以合并实施存储层。

### C · 开发期接入(30 分钟,个人工具链)

```bash
# 本机装 Open Design CLI,把 MCP server 挂进 Claude Code:
od mcp install claude
```

之后在本仓库里的 Claude Code 会话可以直接:浏览 151 个 design system 找灵感、用它的 prototype 模板快速出 marketing 页草稿、读它项目里的 live 设计源文件(避免"导出 zip → 贴回来"的迭代断流)。这纯粹是你个人开发工作流的增益,不进代码库、不影响团队。

**注意:** daemon spawn 本地 CLI 且有 BYOK proxy,只在本机开发环境用,别配任何生产 key 进去。

### D · 预览/导出管线(只抄思路,暂不实施)

记录两个值得抄的实现决策,供方案 B 二期用:
- **沙箱预览**:单个完整 `<artifact>` HTML 块 → `iframe srcdoc` 渲染,CSP 收紧——telepace 若要在 app 内预览生成的报告,这比开新路由更安全;
- **artifact lint**(`/api/artifacts/lint`):生成后先机器校验(完整性/外链/尺寸)再给用户——对应 agent-loop 设计稿里的 P2 验证钩子,同一个模式。

## 4. 实施顺序建议

```
本周   A(DESIGN.md,1h)+ C(od mcp install,30min)
下一步 B 的 spec:先用一个真实 campaign 的 analyst JSON 手动跑一次
       模板→HTML,验证产物质量再排期(~1 周工程)
搁置   D、整体 daemon、PPTX/视频导出
```

## 5. 风险与边界

- **License**:主体 Apache-2.0 可 vendor;逐个检查所拆模板目录内的 LICENSE(guizang-ppt 等为 MIT),vendor 时保留声明文件;
- **上游漂移**:vendor 而非依赖——模板拿进来就归我们维护,不追上游版本;
- **质量方差**:LLM 生成 HTML 报告的稳定性需要 lint + golden 样例回归(方案 D 的 lint 思路),不达标不上生产;
- **数据边界**:方案 C 的本地 daemon 不接触任何生产数据/密钥;方案 B 全程在 telepace 自己后端内完成,不外发。

## 附录 · 参考

- 仓库:https://github.com/nexu-io/open-design(README:架构、MCP、design systems 章节)
- 文档:`docs/architecture.md`、`docs/agent-adapters.md`、`docs/skills-protocol.md`、`docs/design-systems.md`
- Anthropic Agent Skills 规范(SKILL.md):https://docs.anthropic.com/en/docs/claude-code/skills
- telepace 侧咬合点:`frontend/packages/ui/src/tokens.ts`(品牌真相源)、`agents/analyst/main.py`(报告数据源)、`interfaces/mcp_server/tools/push_insights.py`(现有交付面)
