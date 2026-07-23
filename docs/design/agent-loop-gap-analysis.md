# telepace Agent Loop 差距分析与演进设计稿

> 对比对象:Manus(通用自主 agent)、OpenAI Codex(云端软件工程 agent)、Claude Code(终端 agent harness)。
> 分析对象:telepace 现有的两层 agent 系统 —— `harness/`(命令编排层)+ `agents/orchestrator`(对话式 tool-calling loop)。
> 日期:2026-07-23 · 状态:Draft v1

---

## 0. TL;DR

telepace 的 agent 系统是一个**设计良好的"工作流引擎 + 浅层 tool-calling loop"**,但它与 Manus/Codex/Claude Code 这类前沿 agent loop 之间隔着一代架构。核心差距不在"缺某个功能",而在**五个系统性能力**:

| # | 能力 | telepace 现状 | 前沿基线 |
|---|------|--------------|----------|
| 1 | **上下文工程**(context engineering) | 无状态、每轮全量重传、tool result 塞 user message | KV-cache 友好的 append-only 上下文、结构化 tool_result 块、自动压缩 |
| 2 | **持久执行**(durable execution) | loop 活在一次 HTTP 请求里,断连即终止 | 任务可后台运行数十分钟~数小时,可恢复、可续跑 |
| 3 | **计划与自我验证**(planning & verification) | 6 轮硬上限,无计划、无验证、无重试策略 | todo/plan 外化、act→verify→repair 闭环、失败保留在上下文中 |
| 4 | **分层记忆**(memory hierarchy) | Redis TTL 1h 的 campaign dict,无文件系统式外部记忆 | 文件系统即记忆、可压缩可恢复、跨会话持久 |
| 5 | **子 agent 与隔离**(sub-agents & sandbox) | 单 loop 单 agent,follow_up 递归无深度控制 | 子 agent fan-out、独立上下文、结果回传不污染主上下文 |

好消息:harness 的**事件溯源底座**(events 表 + projection + tail loop)恰好是构建 durable agent loop 最难的那块地基,而且已经在生产路径上验证过。演进不需要推翻,只需要在其上补五层。

---

## 1. 现状:telepace 的两个 "loop"

### 1.1 Harness(`harness/orchestrator.py`)—— 不是 agent loop,是命令总线

```
Command → PolicyStack.allow → IntentRouter(静态表) → Agent.run(一次 LLM 调用)
        → persist events → memory.update → follow_up_commands(递归)
```

本质是 **CQRS 命令处理器**:每个 `Agent.run()` 内部只有一次(或零次)LLM 调用,产出 events + response。`InterviewerAgent`、`DesignerAgent` 都是"单发推理",没有循环。路由是静态字典(`router.py` 的 `_ROUTING_TABLE`),不做任何基于模型的决策。

这一层的定位其实**没有问题**——它对应的是 Claude Code 里的 "hook + 权限系统 + 事件持久化",是治理层而非智能层。

### 1.2 OrchestratorAgent(`agents/orchestrator/main.py`)—— 真正的 agent loop,但是 2023 年形态

```python
for _ in range(max_turns):        # 硬上限 6 轮
    resp = await llm.complete(system, convo, tools)
    if not resp.tool_calls:
        yield done; return
    for call in calls:
        result = await handler(call.arguments, **deps)
        convo.append(LLMMessage(role="user",
            content=f"[tool {call.name} result] {json.dumps(result)}"))
```

这是教科书式的 ReAct loop,能跑通 "create → progress → insights → push" 这类 2–4 步链条。但把它放到 Manus/Codex/Claude Code 的坐标系里,每一行都能看到差距(§2 逐条展开)。

### 1.3 已有的、被低估的资产

- **事件溯源**:所有 agent 行为落 `events` 表,天然具备 replay / audit / resume 的原料——Manus 团队自己造 "append-only context + 文件系统" 来达到的性质,telepace 在存储层免费拥有。
- **PolicyStack**(budget/PII/escalation):对应 Claude Code 的 permission hooks,只是目前只挂在 Harness 命令入口,没有挂在 tool-calling loop 的每一次 tool 调用上。
- **MCP 工具单一定义**(`MCP_TOOL_REGISTRY` + `TOOL_HANDLERS` 双面复用):这是对的,Claude Code 也是同一工具面同时服务 CLI/SDK/MCP。
- **SSE 流式事件协议**(text/tool_call/tool_result/done):形状与 Claude Agent SDK 的 message stream 同构,前端消费面不用改。

---

## 2. 逐项差距分析

### G1 · 上下文工程 —— 最大且最便宜可修的差距

**现状问题(按严重度):**

1. **tool result 被序列化成 user message 文本**(`orchestrator/main.py:143-148`)。
   - 丢失了 provider 原生的 `tool_use_id ↔ tool_result` 配对 → 模型对"哪个结果对应哪个调用"的理解靠猜;
   - 大 JSON dump 直接进上下文,无截断、无摘要 → `list_campaigns` 返回 52 个 study 就是 52 个 study 的全量 JSON;
   - assistant 的 tool_use 块被替换成 `"Calling: create_campaign"` 文本 → **每一轮都改写了历史**,KV cache 100% 失效。
2. **无上下文预算管理**:没有 token 计数、没有接近上限时的压缩(compaction)、没有"保留最近 N 轮 + 摘要更早轮次"。Manus 的核心论文级经验("context 增长到炸是 agent 必然,压缩是一等公民")完全缺席。
3. **无状态**:`/agent/chat` 每次请求前端全量重传 messages,服务端不持有会话 → 无法做增量 caching,也无法在服务端做压缩(压缩了下次请求又被前端原文覆盖)。

**前沿基线做法:**

- **Claude Code**:append-only 消息序列 + 原生 content blocks;上下文接近上限时自动 `/compact`(把旧轮次摘要成一条 summary 注入);tool result 超长时截断并落盘,给模型一个文件路径。
- **Manus**:强调 KV-cache 命中率是 agent 成本/延迟的第一指标——system prompt 稳定前缀、工具定义不动、只 append 不 rewrite;用文件系统承接大观测值(网页、日志),上下文里只留路径和摘要。
- **Codex**:云端容器内 session 持久,上下文由服务端管理,用户增量发消息。

**设计:C1 会话服务端化 + 原生块协议**

```
新表 agent_sessions(id, org_id, author_id, title, created_at)
新表 agent_turns(session_id, seq, role, blocks JSONB, token_est, created_at)
  -- blocks 存 provider 原生 content blocks:
  --   [{"type":"text",...}, {"type":"tool_use","id","name","input"},
  --    {"type":"tool_result","tool_use_id","content"}]

POST /v1/agent/sessions            → 建会话
POST /v1/agent/sessions/{id}/chat  → 只传增量 user 消息,服务端拼装完整历史
```

`LLMMessage` 从 `content: str` 升级为 `content: str | list[ContentBlock]`;OpenRouter/Anthropic 客户端各自映射到原生 tool 协议(两家都支持)。**这是所有后续能力的地基**——没有服务端会话,压缩、恢复、后台执行都无从谈起。

**设计:C2 观测值治理(observation management)**

- 每个 tool result 在进入上下文前经过 `render_for_context(result) -> ContextRendering`:
  - `inline`:小结果(< ~2KB)原样进入;
  - `truncated + artifact_ref`:大结果截断到首尾片段,全量写入 `agent_artifacts` 表(或 S3),上下文里附 `artifact://{id}`,并提供一个 `read_artifact(id, range)` 工具让模型按需回读——这就是 Manus "文件系统即上下文" 的数据库版;
  - `card`:list 类结果只进 id+title+status 摘要(前端已经渲染 rich card,模型不需要全文,orchestrator prompt 里甚至已经写了"不要复述列表"——但上下文里还是塞了全文,自相矛盾)。
- 压缩策略:`token_est` 累计超过阈值(如模型窗口的 60%)时,把最旧的 turn 段落交给 fast 模型(已有 `llm_model_fast`)生成结构化摘要,替换为一条 `{"type":"compaction_summary"}` turn。原始 turns 不删(事件溯源习惯),只是不再进 prompt。

### G2 · 持久执行 —— 与 Codex/Manus 的产品级差距

**现状问题:** loop 生命周期 == 一次 SSE HTTP 请求。`request.is_disconnected()` 为真就直接 return——用户关掉浏览器标签页,agent 做到一半的多步任务(比如 "把这 3 个 study 的 insight 都推到 Notion")就静默死亡,且没有任何记录表明它死在哪一步。

**前沿基线做法:**

- **Codex**:任务提交后在云容器里跑几分钟到几小时,完成后回推 diff/PR;用户可以关电脑。
- **Manus**:异步任务队列 + 事件流回放,重连后看到全部中间过程。
- **Claude Code**:本地进程天然持久 + `resume` 从 transcript 恢复;云端版(claude.ai/code)同样任务化。

**设计:D1 任务化 agent run**

利用现有事件溯源基座,把 agent loop 本身事件化:

```
新事件类型(进现有 events 表,复用 tail loop 生态):
  agent_run.started   {session_id, run_id, goal}
  agent_run.step      {run_id, seq, kind: llm|tool, name, input_digest, output_digest}
  agent_run.completed {run_id, outcome}
  agent_run.failed    {run_id, step_seq, error}

执行模型:
  POST /chat 不再直接驱动 loop,而是 append agent_run.started
  → 独立 worker(embedded_worker 已有开关)消费并驱动 loop
  → 每步落 agent_run.step + 更新 agent_turns
  → SSE 端点变成"订阅 run 的事件流"(Postgres LISTEN/NOTIFY 或轮询 seq)
```

收益:
- **断连无损**:SSE 只是视图,断了重连从上次 seq 继续读;
- **崩溃恢复**:worker 重启后扫描 started-but-not-completed 的 run,从 `agent_turns` 重建上下文续跑(loop 每步幂等:tool 调用前查 `agent_run.step` 是否已有该 seq);
- **审计免费**:与 billing 的 usage_records 同一套观察习惯。

实施上可以分两档:第一档保留同步执行但**同时落事件**(纯增益,风险为零);第二档才切到 worker 驱动。

### G3 · 计划、验证与失败处理 —— 智能层差距

**现状问题:**

1. **无计划外化**:6 轮上限是唯一的"任务管理"。Manus 的 todo.md 机制(把计划写进上下文末尾反复重述,对抗 lost-in-the-middle)、Claude Code 的 TodoWrite、Codex 的任务分解,telepace 都没有。对于 "create → refine → start → dispatch → 汇报" 这种 5+ 步链条,模型在第 4 轮就容易忘记最初目标。
2. **无验证闭环**:tool 成功 ≠ 任务成功。前沿 loop 的共同模式是 act → **verify** → repair:Codex 跑测试验证 diff,Claude Code 跑 lint/build,Manus 重新读取产出物检查。telepace 的 orchestrator 拿到 tool result 就信,没有任何"回读确认"步骤。
3. **失败处理反模式**:`max_turns` 耗尽时输出一句 "I've done several steps — let me know if you'd like me to continue" ——**丢弃了全部进度状态**,用户说 continue 也无从继续(无会话)。另外 tool error 虽然会回传给模型(这点做对了,Manus 强调"保留失败让模型自适应"),但没有重试预算:同一个 tool 连续失败 N 次没有熔断,烧钱空转。
4. **单模型单档位**:orchestrator 全程用 general 模型。Claude Code 的 effort 分层、Manus 的 planner/executor 分离都指向:计划/压缩/摘要用便宜快模型,推理主干用强模型。telepace 的 Settings 里 heavy/general/fast 三档模型**已经配好了,但 orchestrator 没用**。

**设计:P1 结构化计划工具 + 重述**

- 新增内建工具 `update_plan(items: [{step, status: pending|doing|done|skipped}])`,结果不进 artifact 而是**始终 pin 在上下文尾部**(每轮重新注入最新 plan,旧 plan turn 被替换标记)——这是 Manus todo.md 的最小实现;
- system prompt 增加规则:≥3 步的请求必须先 `update_plan`,每完成一步更新状态。

**设计:P2 验证钩子(per-tool verifier)**

- 工具注册表增加可选 `verify` 字段:`create_campaign` 的 verify = `get_campaign_progress(id)` 确认存在;`push_insights` 的 verify = 检查 delivery 状态。verify 结果作为额外 observation 进上下文,由模型判断是否 repair;
- 高风险工具(start_campaign / dispatch_invites,prompt 里已标注 outward-facing)接入 **PolicyStack 到 tool 层**:loop 在执行 tool 前调用 `policies.allow_tool(call, ctx)`,budget/escalation 策略从"命令级"下沉到"工具调用级"。EscalationPolicy 可返回 `needs_confirmation` → loop yield 一个 `{"type":"confirm_request"}` SSE 事件,前端弹确认,用户批准后 run 继续(依赖 G2 的任务化,同步模式下降级为直接拒绝并说明)。

**设计:P3 失败预算与降级**

- per-tool 连续失败计数,≥3 次 → 该工具本 run 内禁用并告知模型换路;
- `max_turns` 从常量 6 改为按 token/成本预算(复用 BudgetPolicy 思路),耗尽时**落盘 run 状态**(依赖 G2),回复中附 "resume run {id}" 能力;
- 模型分档:压缩/摘要/plan 更新 → `llm_model_fast`;主干推理 → general;用户显式要求深度分析 → heavy。

### G4 · 记忆分层 —— 目前只有"中间那层"

**现状:** 只有 campaign 级 Redis dict(TTL 1h)。三个缺口:

| 层 | Claude Code 对应物 | telepace 现状 |
|----|--------------------|----------------|
| 会话内工作记忆 | transcript + compaction | ❌ 无(G1 解决) |
| 任务/项目工作区 | 文件系统、scratchpad | ❌ 无(C2 的 artifacts 解决一半) |
| 跨会话长期记忆 | CLAUDE.md / memory 目录 | ❌ 无 |

**设计:M1 org 级 agent 记忆**

```
新表 agent_memories(org_id, name, kind: preference|fact|reference, body, updated_at)
```

- 新工具 `remember(name, body)` / 由压缩流程自动抽取("用户偏好把 insight 推到 Notion 的 XX page");
- 每个新 session 的 system prompt 注入该 org 的 memories(截断到 ~1KB);
- 这直接改善产品体验:研究员第二次说"照老规矩推一下",agent 知道"老规矩"是什么。
- 注意租户边界:记忆严格按 org_id 隔离,PIIPolicy 在写入前过一遍。

### G5 · 子 agent 与并发 —— 规模化差距

**现状:** `follow_up_commands` 递归 `handle()` 无深度限制(理论上可无限递归,虽然当前 agent 都不会自发 emit follow_up 链);orchestrator loop 内 tool 顺序执行;没有"派一个子任务出去、拿摘要回来"的机制。

**前沿基线:** Claude Code 的 Agent tool(独立上下文子 agent,只回传结论,不污染主上下文)、Manus 的 executor fan-out、Codex 的并行任务。核心价值是**上下文隔离**:分析 50 份 transcript 这种事,主 loop 只应该拿到综合结论,而不是 50 份原文。

**设计:S1 最小子 agent 机制**

- 新内建工具 `delegate(task: str, tools: [name]) -> summary`:起一个独立的迷你 loop(独立 turns、独立预算、只允许白名单工具、fast/general 模型),完成后**只有最终 summary 回主上下文**;
- 天然适配已有场景:`ask_followup`(AnalystFollowupService 跨 transcript 问答)本质上就该是一个子 agent,而不是一个巨型单发工具;
- 并发:同一轮的多个独立 tool_calls 用 `asyncio.gather` 并行执行(现在是顺序 for 循环——`list_campaigns` + `get_billing_summary` 完全可以并行);
- `follow_up_commands` 递归加 `depth` 参数,超过 3 层拒绝——一行防御性修复,可以立刻做。

---

## 3. 目标架构总览

```
                      ┌────────────────────────────────────────────┐
                      │              Agent Run Worker               │
                      │  (embedded 或独立进程,消费 agent_run 事件)   │
                      │                                            │
  POST /sessions/{id} │   ┌──────── Agent Loop v2 ────────┐        │
  /chat ──► events ──►│   │ 1 load session turns (+memory) │        │
                      │   │ 2 compact if over budget  ◄────┼─ fast  │
  GET /runs/{id}      │   │ 3 llm.complete (native blocks)◄┼─ general
  /stream ◄─ SSE ─────│   │ 4 policies.allow_tool ─► 确认? │        │
   (订阅事件,可重连)   │   │ 5 gather(tool calls) 并行执行  │        │
                      │   │ 6 render_for_context / artifact│        │
                      │   │ 7 verify hooks                 │        │
                      │   │ 8 persist turn + run.step 事件 │        │
                      │   │ 9 loop until done/budget       │        │
                      │   └───────────┬───────────────────┘        │
                      │               │ delegate()                  │
                      │        ┌──────▼──────┐                     │
                      │        │  Sub-loop    │ (独立上下文/预算)    │
                      │        └─────────────┘                     │
                      └────────────────────────────────────────────┘
   存储:agent_sessions / agent_turns / agent_artifacts / agent_memories
   复用:events 表(run 生命周期)、PolicyStack、MCP_TOOL_REGISTRY、三档模型
```

Harness 保持不变——它继续做命令治理;Loop v2 通过 tool handlers 调用它,分层不动。

---

## 4. 实施路线(按 ROI 排序)

| 阶段 | 内容 | 工作量 | 解锁 |
|------|------|--------|------|
| **P0 修缺陷** | follow_up 递归深度限制;同轮 tool_calls 并行;list 类结果卡片化摘要 | ~1 天 | 立刻降本、防御 |
| **P1 会话服务端化** | agent_sessions/turns 表 + 原生 content blocks + 增量 chat API | ~3–4 天 | G1 地基,前端 payload 变小 |
| **P2 上下文治理** | artifact 落盘 + read_artifact 工具 + 自动压缩(fast 模型) | ~3 天 | 长对话不炸、成本可控 |
| **P3 计划与策略下沉** | update_plan 工具 + PolicyStack 挂 tool 层 + 失败预算 + 模型分档 | ~3 天 | 多步任务成功率、高危操作确认 |
| **P4 任务化执行** | agent_run 事件 + worker 驱动 + SSE 订阅重连 + resume | ~5 天 | 后台长任务(对齐 Codex/Manus 的产品形态)|
| **P5 记忆与子 agent** | agent_memories + remember 工具;delegate 子 loop | ~4 天 | 跨会话个性化、大规模分析 |

P0–P2 不改产品形态,纯质量/成本收益;P3 起产品可感知(确认弹窗、计划可视化);P4 是形态跃迁(chat → 可托管任务)。

---

## 5. 明确不做的(non-goals)

- **不引入 LangGraph/AutoGen 等框架**:现有 loop 200 行,上述全部设计加起来 <2000 行,自持成本远低于框架适配成本;Manus/Claude Code 也都是手写 loop。
- **不做浏览器/代码执行沙箱**:那是 Manus/Codex 的领域需求;telepace 的工具面是自家 API,风险模型完全不同,PolicyStack + 确认流足够。
- **不动 Interviewer 的单发推理**:访谈逐轮响应延迟敏感,单发 + fast 模型是正确取舍,不需要变成 loop。
- **不做多模型路由中间层**:三档模型的静态分工够用,动态路由等有数据再说。

---

## 附录 A · 三家前沿系统速查

| 维度 | Manus | Codex (cloud) | Claude Code |
|------|-------|---------------|-------------|
| 执行环境 | 云 VM + 浏览器/文件/shell | 云容器 + repo 快照 | 本地进程(+云版) |
| 上下文策略 | KV-cache 优先、文件系统即记忆、todo 重述 | 服务端会话、diff 为中心 | append-only + compaction + CLAUDE.md |
| 计划 | 显式 todo.md 循环重述 | 任务分解 + PR 粒度 | TodoWrite / plan mode |
| 验证 | 回读产出物 | 跑测试/CI | lint/build/test hooks |
| 失败处理 | 保留错误在上下文,模型自适应 | 重试 + 回报失败 | hook 拦截 + 用户确认 |
| 工具屏蔽 | logits mask(不动工具定义,只约束选择) | 固定工具面 | permission 系统 + settings |
| 子 agent | executor fan-out | 并行任务 | Agent tool(隔离上下文) |
| 持久化 | 事件流可回放 | 任务制,离线完成 | transcript + resume |

## 附录 B · 现状代码索引

- 命令总线:`harness/orchestrator.py:64`(handle)、`harness/router.py:7`(静态路由表)
- 对话 loop:`agents/orchestrator/main.py:98`(6 轮循环)、`main.py:143`(tool result 文本化——G1 主要病灶)
- 策略:`harness/policies/base.py:28`(PolicyStack,待下沉到 tool 层)
- 记忆:`harness/memory.py:37`(RedisMemory,TTL 1h)
- SSE 入口:`interfaces/rest_api/routers/agent.py:46`(无会话、全量重传)
- 三档模型配置:`interfaces/rest_api/config.py:112-114`(已有,loop 未使用)
- 单发 agents:`agents/interviewer/main.py:79`(一次 complete,正确的取舍)
