"use client";

/**
 * The three agent surfaces (MCP · REST · Skill), one tabbed code panel.
 * On tab switch the lines of the sample fade in once, staggered — a nod
 * to terminal output, inside the fade-in-once motion budget.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

const SAMPLES = {
  mcp: `// Claude Code
claude> use the telepace mcp to launch a pricing study

// telepace.create_campaign
✓ campaign_id: 4f2b…9c1
✓ share_url: telepace.io/r/4f2b9c1

// 3 days later
claude> get insights for the pricing study

// telepace.get_campaign_insights
✓ 3 themes surfaced (confidence ≥ 0.7)
  · "$79 feels punitive without SSO"
  · "annual discount changes the calculus"
  · "usage-based would beat both tiers"`,
  rest: `$ curl -X POST https://api.telepace.io/v1/campaigns \\
    -H "Authorization: Bearer $TELEPACE_KEY" \\
    -d '{ "goal": "Understand pricing objections" }'

{
  "campaign_id": "4f2b…9c1",
  "share_url": "https://telepace.io/r/4f2b9c1",
  "status": "live"
}

$ curl https://api.telepace.io/v1/campaigns/4f2b…9c1/insights

{ "themes": 3, "interviews": 24, "confidence": ">= 0.7" }`,
  skill: `# Claude Code — Skill
/telepace study "Why do trials stall before activation?"

✓ outline drafted · 6 questions
✓ campaign live: telepace.io/r/8a41c22

# later that week
/telepace insights 8a41c22

→ 3 themes · 24 interviews · confidence ≥ 0.7
  · "onboarding asks for a card too early"
  · "empty workspace feels like homework"
  · "invites are the real activation moment"`,
} as const;

type TabKey = keyof typeof SAMPLES;

const TABS: TabKey[] = ["mcp", "rest", "skill"];

export function AgentSurfacesTabs() {
  const t = useTranslations("marketing.home.agentSurfaces.tabs");
  const [active, setActive] = useState<TabKey>("mcp");
  const lines = SAMPLES[active].split("\n");

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-ink shadow-hairline">
      <div className="flex items-center gap-1 border-b border-paper/10 px-3 pt-3" role="tablist">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            onClick={() => setActive(key)}
            className={`rounded-t-md px-3.5 py-2 font-mono text-xs transition-colors ${
              active === key
                ? "bg-paper/10 text-paper"
                : "text-paper/50 hover:text-paper/80"
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>
      {/* key={active} remounts the block so lines replay their one-shot fade */}
      <pre
        key={active}
        className="min-h-[340px] overflow-x-auto whitespace-pre-wrap p-6 font-mono text-[13px] leading-relaxed text-paper"
      >
        {lines.map((line, i) => (
          <span
            key={i}
            className="tp-fade-in-up block"
            style={{ animationDelay: `${i * 45}ms` }}
          >
            {line || " "}
          </span>
        ))}
      </pre>
    </div>
  );
}
