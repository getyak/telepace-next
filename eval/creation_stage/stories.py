"""10 user stories for creation-stage evaluation.

Each story is the seed input a researcher would type into the AI. The runner
uses this to hit ``POST /v1/campaigns`` and expects the Designer to produce
a shipping-quality initial spec + a plausible simulated respondent.

Fields mirror the ``CreateCampaignBody`` in
``interfaces/rest_api/routers/campaigns.py`` plus a per-story
``must_have`` block that judges use to check coverage.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Story:
    id: str
    title: str
    goal: str
    background: str
    target_completions: int
    budget_usd: float
    channels: list[str]
    persona_hint: str
    must_have_keywords: list[str] = field(default_factory=list)


STORIES: list[Story] = [
    Story(
        id="US-01",
        title="独立咖啡店品牌重塑测试",
        goal="了解老客户对新 logo 的情感反应，特别是新设计是否保留了品牌的温暖感",
        background="成都独立精品咖啡店，即将更换 logo；老客户占营业额 70%，创始人担心新设计会疏远熟客",
        target_completions=15,
        budget_usd=200,
        channels=["web_text"],
        persona_hint="过去 90 天到店 ≥3 次的成都本地熟客",
        must_have_keywords=["温暖", "logo", "熟客"],
    ),
    Story(
        id="US-02",
        title="B2B SaaS 用户流失访谈",
        goal="访谈近 30 天流失的 Basic/Pro 付费用户，找出他们真正的取消原因，尤其是竞品价格因素",
        background="B2B SaaS 公司；订阅取消率过去 60 天上涨 2 倍；PM 怀疑但没有证据",
        target_completions=20,
        budget_usd=500,
        channels=["web_text"],
        persona_hint="过去 30 天从付费降级或取消的 Basic/Pro 用户",
        must_have_keywords=["取消", "价格", "竞品"],
    ),
    Story(
        id="US-03",
        title="Figma 原型多市场可用性测试",
        goal="在美国、日本、巴西各招募 15 位受访者测试同一 Figma 原型的搜索与结账流程",
        background="跨国零售品牌新版 App；三个市场用户习惯迥异；需要文化本地化措辞",
        target_completions=45,
        budget_usd=1200,
        channels=["web_voice"],
        persona_hint="3 国 18-45 岁日常线上购物者",
        must_have_keywords=["原型", "结账", "搜索"],
    ),
    Story(
        id="US-04",
        title="Z 世代 Slogan 投射测试",
        goal="盲测三个 slogan 候选（A/B/C），了解哪个最能打动 Z 世代消费者",
        background="新消费品牌准备秋季 campaign；三条 slogan 候选风格差异较大",
        target_completions=30,
        budget_usd=800,
        channels=["web_text"],
        persona_hint="18-25 岁 Z 世代都市消费者",
        must_have_keywords=["slogan", "情感", "Z 世代"],
    ),
    Story(
        id="US-05",
        title="糖尿病用户生物数据分享调研",
        goal="了解 II 型糖尿病用户对将血糖数据分享给第三方 App 的接受度与顾虑",
        background="数字健康 App；HIPAA/GDPR 敏感话题；需要显式知情同意与敏感题跳过机制",
        target_completions=25,
        budget_usd=600,
        channels=["web_text", "web_voice"],
        persona_hint="使用 CGM 或指血监测的 II 型糖尿病患者",
        must_have_keywords=["血糖", "隐私", "同意"],
    ),
    Story(
        id="US-06",
        title="AI 报税助手 PMF 探索访谈",
        goal="验证小微企业主是否愿意为 AI 报税助手付费；用 Mom Test 方法学",
        background="种子轮创业者，产品尚未开发；需要谈过去痛点而非未来意愿",
        target_completions=8,
        budget_usd=200,
        channels=["web_text"],
        persona_hint="经营 1-5 人小微企业、每年亲自报税的老板",
        must_have_keywords=["报税", "痛点", "过去"],
    ),
    Story(
        id="US-07",
        title="K12 家长与孩子课程双身份反馈",
        goal="同时收集家长与 10-14 岁孩子对秋季课程的反馈；主干共享、措辞差异化",
        background="K12 在线教育平台；家长关心成绩，孩子关心趣味；孩子访谈需家长同意",
        target_completions=60,
        budget_usd=900,
        channels=["web_text", "web_voice"],
        persona_hint="家长 30-45 岁 + 孩子 10-14 岁的双身份配对",
        must_have_keywords=["家长", "孩子", "课程"],
    ),
    Story(
        id="US-08",
        title="老年数字支付电话访谈",
        goal="访谈 12 位不同城市的 65 岁以上老人，了解他们使用数字支付的真实困境",
        background="地方政府政策研究；受访者低文化水平；需要电话渠道、母语开场语",
        target_completions=12,
        budget_usd=300,
        channels=["phone_outbound"],
        persona_hint="65 岁以上、覆盖 4 城市 × 3 生活状况（独居/与子女住/养老院）",
        must_have_keywords=["老人", "支付", "电话"],
    ),
    Story(
        id="US-09",
        title="面试失败候选人体验回访",
        goal="访谈过去 60 天面试失败的候选人，找出候选人体验痛点；用 CIT + Projective 方法",
        background="大公司 HR 提升 Candidate Experience；受访者心理防御强、需要匿名承诺与情绪缓冲",
        target_completions=25,
        budget_usd=750,
        channels=["web_text"],
        persona_hint="过去 60 天面试后被拒的候选人",
        must_have_keywords=["面试", "匿名", "体验"],
    ),
    Story(
        id="US-10",
        title="外卖骑手身份认同学术访谈",
        goal="做 IPA (Interpretative Phenomenological Analysis) 六阶段半结构化访谈；写入博士论文",
        background="社会学博士候选人；主题是零工经济骑手的自我认同；需要知情同意、录音授权、深度而非广度",
        target_completions=10,
        budget_usd=500,
        channels=["web_voice"],
        persona_hint="每周接单 ≥30 单、工龄 ≥6 个月的外卖骑手",
        must_have_keywords=["身份", "骑手", "认同"],
    ),
]
