# telepace 重设计方向决策稿:风格推理与差距清单

> 依据:2026-07-23 对 live 产品(localhost:3300)六个关键页面的实际截图审计
> (marketing 首页 / studies 空态 / 新建 study 双栏 / settings+billing / insights / audience)、
> `telepace-vs-listenlabs-PRD.md` 竞品逐屏对比、`tokens.ts` 设计意图注释。
> 状态:Draft v1 · 结论先行

---

## 0. 风格判定(推理结论)

**保留并深化现有风格——"editorial quiet luxury",不换方向。重设计的主战场不是"换风格",而是"把这个风格从 marketing 页贯彻到数据密度场景"。**

### 推理链

**前提 1 · 竞品格局决定差异化轴。** PRD 的逐屏对比给出关键事实:Listen Labs 是"干净 SaaS 蓝 / 信息密度高";整个品类(Listen Labs、Outset、Strella…)全部长着同一张"现代 SaaS 脸"。telepace 若转向"更现代/更 SaaS",就是**主动放弃唯一的视觉识别度,去和资金更充足的对手打同质化战争**。PRD 自己的结论也是:"telepace 的定位与视觉是加分项,不要丢。"

**前提 2 · 风格与产品叙事同构。** telepace 卖的是"insights that read like a researcher wrote them"——研究报告的质感、引用的严肃性、编辑部的可信度。衬线标题 + 暖纸底 + 墨色阶梯恰好是**这个承诺的视觉化**:界面本身就长得像一份被认真编辑过的研究文档。换成 SaaS 蓝,叙事和皮肤就脱节了。

**前提 3 · 实测证明该风格在数据场景成立。** 审计中最强的一页是 **Audience**:衬线大数字(380/220/68)+ 小号 letterspaced 标签(DELIVERED/OPENED/COMPLETED)+ 上边线,把"漏斗数据"排成了年报排版——信息密度和编辑气质**同时成立**。这一页证明风格没有天花板问题,问题只是其他页面没做到这个水准。

**前提 4 · 目标用户气质匹配。** PRD 定位:"偏工程/PMM/可对接 Claude Code、Cursor"。这群人日常泡在 Linear、Anthropic、Mercury 里——恰是 tokens.ts 注释里点名的参照系。这个审美选择对了受众。

**结论:换风格 = 负期望值。深化风格 = 把已被 Audience 页证明的水准推平到全产品。**

### 深化的方向词

以 **Anthropic.com(编辑克制)× Mercury(数据即排版)× 纸质研究档案(materiality)** 为北极星,补三个现有实现还欠缺的维度:

1. **数据的编辑化**(Audience 页水准 → 全站):数字用衬线、标签用 letterspaced caps、对齐用上边线,拒绝默认的 dashboard widget 感;
2. **材质感**(tokens 里 `desk`/`paper` 阶梯的"letter-on-a-desk"隐喻,目前只有 marketing hero 用了):app 内关键"成果物"(study 卡、insight 卡、report)应该被感到"放在桌面上",而不是浮在均匀的米色里;
3. **暖色人性时刻**:访谈是与真人对话的产品,accent sage 之外,`terracotta` 目前只做警示——可以让它在 verbatim 引用、受访者身份等"人"出现的地方承担一点温度(克制地)。

---

## 1. 审计发现:设计意图 vs 实际渲染的落差清单

评分 = 当前页面达到"Audience 页水准"的程度。

### 1.1 Marketing 首页 — 8/10,两个真问题

✅ 层级、双语衬线 hero、MCP 代码卡片、黑色 CTA 收尾都成立。

- **[M1] scroll-reveal 让内容默认 opacity:0**(`tp-reveal`)。headless 截图四大段空白 → 意味着:无 JS/爬虫/低端设备/`prefers-reduced-motion` 用户看到的是空页。修法:CSS 默认可见,JS 加载后才降为隐藏再 reveal(渐进增强反转),或至少尊重 reduced-motion。
- **[M2] hero 右侧 live demo 卡片视觉重量不足**:这是全页唯一可交互的差异化证明("试答一题"),但排版存在感弱于左侧标题,值得升格为"放在桌上的一张卡"(用 `desk` 底 + overlay 阴影)。

### 1.2 Studies 空态 — 5/10,首触点太冷

- **[S1] 空态是全产品第一印象,当前只有一个图标+两行字+按钮**,右侧 70% 空间闲置。这里应该是"编辑部的第一页":放 3 个可点击的示例研究模板(PRD 指出 Listen Labs 有分类模板起手)+ 一句品牌化文案。空态即 onboarding。
- **[S2] `+ New study` 按钮同屏出现两次**(头部 + 空态内),冗余。

### 1.3 新建 study(双栏)— 6/10,PRD 主诉的战场

- **[N1] 左栏 Design Chat 的建议 pill 之下是整栏空白**——对话开始前左栏无内容支撑。参照 Listen Labs 的领域感知起手:pill 应该更丰富(分类模板),或左栏底部给出"agent 会做什么"的说明。
- **[N2] 右栏空态骨架屏(灰条)与"Nothing drafted yet"并存**,骨架屏语义是"正在加载",此处并没有加载——错误的隐喻,应换成描边虚线的"文档待写"形态。
- **[N3] 顶部 Decision→Audience→Depth→Questions 四步指示器存在但视觉太弱**(浅灰小圆圈),这是对 PRD "缺引导式向导"的回应,应该做成页面的主导航层级。
- **[N4] "Simulate respondent" 顶栏右侧孤立灰字**,可发现性差。

### 1.4 Settings / Billing — 6/10

- **[T1] 左侧二级导航(Workspace/Members/…/Danger zone)无选中态强化**,只有字重差异;
- **[T2] Billing 用量三指标(Qualified/Below quality bar/Voice minutes)已用衬线数字**——方向对了,但进度条是纯灰细线,0/20 状态几乎不可见;配额进度是付费转化的关键视觉,应做成 Audience 页那种有存在感的数据排版;
- **[T3] "Acme Research" 占位数据**出现在真实账户的 workspace name 里(应为空态或用户名派生)。

### 1.5 Insights — 7/10,离标杆最近

✅ 主题卡(tag + confidence + 衬线标题 + 左边线 verbatim 引用)已经是"编辑化数据"的正确形态。

- **[I1] verbatim 引用是风格的灵魂时刻,但引用与出处(interview #/角色)分离**,PRD 重点批评"证据可追溯"缺失——设计上引用块应带出处署名行(× 数据上补 citation);
- **[I2] Dismiss 是每张卡唯一操作**,而 PRD 说核心差距是"交叉分析/追问/图表"——设计要为"Ask a follow-up"等未来动作预留卡内动作区;
- **[I3] "Push to Notion" 是页面级唯一 CTA**,与 open-design 集成稿的"Generate shareable report"将来同址,布局要预留。

### 1.6 Audience — 9/10,标杆

保持。唯一小项:**[A1]** uploads 表格的 `synced` 徽章绿色底与整页暖色系有轻微色温冲突,可换 accentSoft。

### 1.7 横切问题

- **[X1] 侧边栏永远塌陷成顶部 240px**,下方大片空白;用户块贴底但中间无内容——可以承载"当前 live 研究的迷你状态"或用量摘要(与 billing 联动);
- **[X2] 页面标题公式化**:每页都是 "小标签 + 衬线大标题 + 下划线",对但单调;标题右侧动作区(按钮)与标题的对齐基线不一致(Audience 页 Import CSV 按钮悬空感);
- **[X3] 明暗只有一套**:纯暖纸系在 OLED 夜间刺眼,长期要有 dark("墨色书房")变体——不进本轮,记录在案。

---

## 2. 与 open-design 的衔接(执行计划)

按既定三阶段走,现在有了靶子:

```
阶段 1(本仓库,不需要 open-design)——修落差
  ① 写 frontend/DESIGN.md v2:把 §0 的三个深化维度写进契约
     (数据编辑化规则 / desk 材质使用规则 / terracotta 人性时刻规则)
  ② 按 §1 清单逐项落地,优先级:
     P0  M1(reveal 可访问性,是缺陷)✅、T3(占位数据)✅
     P1  S1(空态模板化)✅、S2(重复按钮)✅、N2(骨架屏隐喻)✅、
         T2(配额可视化)✅、T1(导航选中态)✅
     P1' 空态模板卡带 ?seed= 直通创建对话(点模板 = 已说出开场白,
         经同一 assessment gate)——S1 与 N1 的闭环解法
     P2  I1(引用出处署名)✅ + confidence 进度条化 ✅
     P3(满分轮,2026-07-23 下午)
       M1' reveal 兜底:JS-但不滚动的渲染器(Googlebot 快照/fullPage 截图)
           3s 超时强制显示——22/22 元素实测可见 ✅
       M2  hero live-demo 卡升格 letter-on-a-desk(desk 托盘 + overlay 阴影)✅
       A0  Audience 页假数据(Pro trial/Churned Q2 假 segment、假 CSV)清除,
           换成幽灵段卡诚实空态(虚线描边 + en-dash 数字保留漏斗排版教学)✅
       TrustBar 三数字对齐 Audience 标准(caps 标签上置 + 上边线)✅
       N3  复查:ReadinessSpine 已有 accent 连接线 + 填充勾,审计描述基于旧版,
           无需再动 ✅
     剩余(功能性,非皮肤):I2-I3(insights 动作区,等分析系统)、
         X1(侧边栏空腔,等实时状态数据)、X3 dark mode(记录不做)

阶段 2(open-design 介入)——两个页面值得生成候选
  仅 S1 空态布局 与 N1-N3 创建页引导结构 存在多方案取舍,
  用 od + telepace design-system 包各生成 2-3 个 HTML 候选给你拍板;
  其余条目方向唯一,直接实现,不值得走生成流程。

阶段 3 —— 按定稿落地 + 每步 pnpm lint && typecheck && build
```

## 3. 本稿之外(记录不做)

- 不换字体、不动色板主体(只可能微调 terracotta 的使用面);
- dark mode(X3)、报告导出视觉(归 open-design 集成稿方案 B)、
  insights 图表体系(归 PRD 分析系统条目,是功能不是皮肤)——均不进本轮。

## 附录 · 审计截图索引(仓库根目录,审计后可删)

- `marketing-home-revealed.jpeg`(强制显示 reveal 后的完整首页)
- `marketing-home-full.jpeg`(默认态,可见 M1 空白缺陷)
- `app-studies-empty.jpeg` / `app-study-new.jpeg` / `app-settings.jpeg`
- `app-settings-billing.jpeg` / `app-insights.jpeg` / `app-audience.jpeg`
