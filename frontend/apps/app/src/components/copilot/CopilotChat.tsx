"use client";

import { Card } from "@telepace/ui";

import { GlobalAgentPanel } from "@/components/agent/GlobalAgentPanel";

/**
 * Cross-study copilot chat. Now a page-embedded surface for the SAME agent that
 * powers the global sidebar — no more mocked template answers. The study
 * selector context above it scopes which studies the researcher is thinking
 * about; the agent's own list_campaigns / analyze tools do the real work.
 *
 * Selected study ids are added to the agent's hidden task context while the
 * chat bubble continues to show only what the researcher typed.
 */
export function CopilotChat({
  selectedStudyIds,
}: {
  selectedStudyIds: string[];
  placeholder?: string;
  sendLabel?: string;
  thinkingLabel?: string;
}) {
  return (
    <Card className="flex h-[560px] flex-col overflow-hidden">
      <GlobalAgentPanel
        className="min-h-0 flex-1"
        scopeStudyIds={selectedStudyIds}
      />
    </Card>
  );
}
