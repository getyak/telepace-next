"use client";

/**
 * The three agent surfaces (MCP · REST · Skill), one tabbed code panel.
 * On tab switch the lines of the sample fade in once, staggered — a nod
 * to terminal output, inside the fade-in-once motion budget.
 *
 * Interface language (commands, curl, JSON keys) stays verbatim; the
 * product's own output — the insight themes — is localized, so the zh
 * homepage demos zh insights.
 */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

type TabKey = "mcp" | "rest" | "skill";

const TABS: TabKey[] = ["mcp", "rest", "skill"];

function buildSamples(ins: (id: string) => string): Record<TabKey, string> {
  return {
    mcp: `// Codex
codex> compile this refund failure into an eval

// telepace.create_campaign
✓ campaign_id: 4f2b…9c1
✓ task_contract: refund eligibility

// telepace.get_eval_pack
✓ 3 candidate cases
✓ 1 critical policy gate
✓ judge order: deterministic → model → human

// evidence compiled
  · ${ins("mcp1")}
  · ${ins("mcp2")}
  · ${ins("mcp3")}`,
    rest: `$ curl -X POST https://api.telepace.io/v1/campaigns \\
    -H "Authorization: Bearer $TELEPACE_KEY" \\
    -d '{ "goal": "Gate refund promises against policy" }'

{
  "campaign_id": "4f2b…9c1",
  "status": "draft"
}

$ curl https://api.telepace.io/v1/campaigns/4f2b…9c1/eval-pack

{
  "schema_version": "telepace.eval-pack.v1",
  "critical_cases": 1,
  "max_critical_failures": 0
}`,
    skill: `# Claude Code · Skill
/telepace eval "Support agent promised an ineligible refund"

✓ correctness contract drafted
✓ 1 unresolved policy boundary
✓ asking the policy owner, not 100 users

# after calibration
/telepace gate 8a41c22 candidate-b

→ HOLD · refund slice 42/100
  · ${ins("skill1")}
  · ${ins("skill2")}
  · ${ins("skill3")}`,
  };
}

export function AgentSurfacesTabs() {
  const t = useTranslations("marketing.home.agentSurfaces.tabs");
  const tIns = useTranslations("marketing.home.agentSurfaces.insights");
  const [active, setActive] = useState<TabKey>("mcp");
  const tabRefs = useRef(new Map<TabKey, HTMLButtonElement>());

  const samples = buildSamples((id) => tIns(id));
  const lines = samples[active].split("\n");

  // Complete tab pattern: arrow keys move focus AND selection (roving).
  function onKeyDown(evt: React.KeyboardEvent) {
    const dir =
      evt.key === "ArrowRight" ? 1 : evt.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    evt.preventDefault();
    const next = TABS[(TABS.indexOf(active) + dir + TABS.length) % TABS.length];
    setActive(next);
    tabRefs.current.get(next)?.focus();
  }

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-ink shadow-hairline">
      <div
        className="flex items-center gap-1 border-b border-paper/10 px-3 pt-3"
        role="tablist"
        onKeyDown={onKeyDown}
      >
        {TABS.map((key) => (
          <button
            key={key}
            ref={(el) => {
              if (el) tabRefs.current.set(key, el);
            }}
            type="button"
            role="tab"
            id={`agent-surfaces-tab-${key}`}
            aria-selected={active === key}
            aria-controls={`agent-surfaces-panel-${key}`}
            tabIndex={active === key ? 0 : -1}
            onClick={() => setActive(key)}
            className={`rounded-t-btn px-3.5 py-2 font-mono text-xs transition-[color,background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-paper/60 tp-press tp-press-control ${
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
        role="tabpanel"
        id={`agent-surfaces-panel-${active}`}
        aria-labelledby={`agent-surfaces-tab-${active}`}
        className="min-h-[340px] overflow-x-auto whitespace-pre-wrap p-6 font-mono text-code leading-relaxed text-paper"
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
