# Agent Teams 评分框架（100 分制，Creation-Stage）

> 目标：给 [02-user-stories.md](./02-user-stories.md) 的 US-01 ~ US-10 打分，直到全部达到 **100 分**。
> 未达标 → optimizer agent 提出 patch → 前端/后端应用 → 再评。
>
> **与现有 `eval/` 的关系**：
> - 现有 `eval/judges/dim01..dim12` + `eval/ci/scoreboard.py` 是**端到端 12 维 rubric（0-12 分）**，对应 `docs/scenarios.md` S1–S10。
> - 本框架是**创建阶段专题 5 评委（100 分）**，代码落在 `eval/creation_stage/`（新目录），复用 `eval/judges/_llm_judge.py` 等基础工具，但独立打分维度与终止条件。
> - 两条评分线并列存在，各自输出 scoreboard。

## 1. 评委阵容（5 个 agent，加权 100%）

| 评委 | 权重 | 评的是什么 | 建议底层模型 |
|---|---|---|---|
| **Judge-Intelligence** | 30% | AI 是否主动、有见识、能给出研究者想不到的建议 | Claude Opus |
| **Judge-Experience** | 25% | 流程流畅度、状态可见、错误宽容、认知负担 | Claude Sonnet |
| **Judge-Aesthetic** | 20% | 视觉层次、留白、字体、色彩、动效、a11y | 视觉模型（GPT-4o 或 Claude with vision） |
| **Judge-Efficiency** | 15% | 从空画布到 spec-ready 的秒数与轮数（可定量） | 确定性算法 |
| **Judge-VsListenLabs** | 10% | 这个 story 能否在该维度"羞辱" Listen Labs | Claude Opus |

**加权公式**：
```
total = 0.30 * intelligence + 0.25 * experience + 0.20 * aesthetic + 0.15 * efficiency + 0.10 * vs_listenlabs
```

**通过条件**：`total >= 98 且 5 位评委均 >= 95` 视为满分。`total == 100` 需要 5 位评委全 100。

## 2. 各评委的内部拆分（各自 100 分）

### Judge-Intelligence
| 子项 | 分值 | 判定 |
|---|---|---|
| 主动性 | 20 | AI 至少提出 1 条用户没想到的假设/对照/方法学 |
| 领域识别 | 15 | 1 轮内识别到场景类型（Churn / Creative / PMF ...） |
| 目标人群推断 | 15 | 主动生成 audience_screener 且给出理由 |
| 方法学解释 | 20 | 显式说 why（不只说 what） |
| 试跑预演 | 15 | 演示假想受访者的答复用于检验题目 |
| 反脆弱 | 15 | 用户反对时**当场改题 + 解释新版本更好在哪** |

### Judge-Experience
| 子项 | 分值 | 判定 |
|---|---|---|
| 流程感 | 20 | 始终"三面同步"（对话 / spec 卡片 / 试跑抽屉），无跳页 |
| 状态可见 | 15 | 生成中/流式/等待/错误 都有明确视觉状态 |
| 错误宽容 | 15 | 网络抖动 / LLM 拒答 / 用户改口时优雅恢复 |
| 认知负担 | 15 | 一次对话中屏幕信息密度不焦虑 |
| 键盘 & a11y | 15 | 快捷键 / Tab 顺序 / aria |
| 记忆延续 | 10 | 关掉再回来能恢复上下文 |
| 移动可用 | 10 | 手机上能用（非"能打开"） |

### Judge-Aesthetic
| 子项 | 分值 | 判定 |
|---|---|---|
| 排版层次 | 20 | H1/H2/正文/元数据 有清晰对比 |
| 色彩克制 | 15 | 主色 + 中性 + 一个语义 accent，无花哨 |
| 留白与节奏 | 15 | 8pt grid、卡片 breathing room |
| 字体选择 | 10 | 标题/正文/数据同家族里的差异 |
| 微动效 | 15 | 200–400ms 有意识动效 |
| 深色模式 | 10 | 深色模式一等公民，非反色 |
| 图标一致 | 5 | 一套图标线宽/端点风格 |
| 空态设计 | 10 | 空态是"下一步"的邀请 |

### Judge-Efficiency（可定量）
| 子项 | 分值 | 判定 |
|---|---|---|
| Time-to-Spec-Ready | 40 | ≤ 90s 满分，线性衰减到 3 分钟为 0 |
| 轮数 | 30 | ≤ 5 轮满分 |
| 流式首 token | 20 | ≤ 800ms 满分 |
| Publish 一键 | 10 | 就绪后 1 次点击可 publish |

### Judge-VsListenLabs
| 子项 | 分值 | 判定 |
|---|---|---|
| 有他没有 | 40 | 至少 1 个 Listen Labs 做不到的能力（如试跑预演） |
| 更少回合 | 20 | 同 story 我方轮数 ≤ 他们 |
| 审美对比更高 | 20 | Aesthetic 评委给"我方 vs 竞品截图"对比打分 |
| 方法学立场 | 20 | Mom Test / IPA / CIT / Projective 之类明示 |

## 3. Agent Teams 协作流程

```
┌─────────────────┐
│  Runner         │ 对每个 US-XX：
│  (Playwright)   │  1) 打开 /studies/new
│                 │  2) 按 YAML 剧本发消息
│                 │  3) 收集 timings + spec snapshot + 截图
└────────┬────────┘
         │ artifacts: timings.json + spec.json + screenshots/*.png
         ▼
┌─────────────────────────────────┐
│  5 Judges (parallel)            │
│  同一份 artifacts               │
│  返回 { score, breakdown, notes}│
└────────┬────────────────────────┘
         │ 5 x scorecard.json
         ▼
┌─────────────────┐
│  Aggregator     │ 加权求 total；<98 时打包 diff
└────────┬────────┘
         │ if total < 98
         ▼
┌─────────────────┐
│  Optimizer      │ 读 breakdown + notes → 提代码 patch
│                 │ 应用 → 触发 rerun
└─────────────────┘
```

## 4. 目录结构（新增）

```
eval/
  judges/                     # 现有（12 维 rubric），保留
    dim01..dim12.py
    _llm_judge.py             # ← 复用
  creation_stage/             # 新增
    __init__.py
    runner.py                 # Playwright 驱动
    judges/
      intelligence.py
      experience.py
      aesthetic.py
      efficiency.py
      vs_listenlabs.py
    aggregator.py             # 加权计算
    optimizer.py              # 提 patch 的 agent
    stories/
      us_01_coffee_logo.yaml
      us_02_churn.yaml
      ...
      us_10_ipa.yaml
    scoreboard.py             # 100 分制表格

docs/
  ai-survey-benchmark/
    01-listenlabs-analysis.md
    02-user-stories.md
    03-scoring-framework.md   ← 本文
    creation-scoreboard.md    # runner 输出（未来生成）
```

## 5. 剧本 YAML 格式（`stories/us_01_coffee_logo.yaml`）
```yaml
id: US-01
title: 独立咖啡店老板测新品牌
persona: 三十出头独立精品咖啡店主
turns:
  - user: "我想调研老顾客对我新 logo 的看法。"
    expect:
      - ai_identifies: creative_testing
      - ai_reflects_back_uncertainty: true
  - user: "对，就是怕失去温暖感。"
    expect:
      - ai_proposes_audience_screener: true
      - ai_asks_city: true
  - user: "成都。"
    expect:
      - spec.outline.items.length: {min: 5, max: 8}
      - spec.audience_screener contains: [到店频次, 地理]
  - user: "第 4 题问得太直白了。"
    expect:
      - ai_edits_question: true
      - ai_explains_why: true
must_have_spec:
  goal_length: {min: 20}
  hypotheses_length: {min: 1}
  outline_items_length: {min: 5, max: 8}
  channels_include: [web_text]
  languages_include: [zh]
```

## 6. 终止条件

- **单 story**：`total >= 98 且 5 评委均 >= 95` → 通过
- **整体**：10 个 story 全部通过
- **保底**：optimizer 连续 5 轮 patch 没有让 total ≥ 2 分提升，停下汇总 `notes` 给人，避免死循环
- **每次 rerun 前**：git diff / 单测 / 类型检查必须过（防止评分提升但代码坏了）

## 7. 下一步 Phase 5

先做**"创建阶段最小可跑通版"**：
1. 前端 `frontend/apps/app/src/app/studies/new/page.tsx:241` — 移除硬编码 `DEFAULT_OUTLINE`
2. 后端 `interfaces/rest_api/routers/campaigns.py:75` — `POST /v1/campaigns` **在返回前调用 LLM** 生成初始 outline（Designer 现在的 `_on_create` 是纯确定性）
3. 前端 `studies/new/page.tsx:88-92` — `onPatch` 补全为**全字段合并**（不只 outline.items）
4. Publish 按钮 — 接 `startCampaign`
5. 加"试跑受访者"抽屉（US-01 的核心亮点）— 后端新 endpoint `POST /v1/campaigns/{id}/simulate` 用 LLM 扮演 persona

完成后跑第一轮评分，看基线，进入 Phase 6 迭代。
