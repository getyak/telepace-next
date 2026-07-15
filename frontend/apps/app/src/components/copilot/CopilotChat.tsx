"use client";

import { Card } from "@telepace/ui";

import { GlobalAgentPanel } from "@/components/agent/GlobalAgentPanel";

/**
 * Cross-study copilot chat. Now a page-embedded surface for the SAME agent that
 * powers the global sidebar — no more mocked template answers. The study
 * selector context above it scopes which studies the researcher is thinking
 * about; the agent's own list_campaigns / analyze tools do the real work.
 *
 * `selectedStudyIds` is retained for API compatibility with the copilot page
 * (and future scoping), but the shared panel drives the conversation.
 */
export function CopilotChat({
  selectedStudyIds: _selectedStudyIds,
}: {
  selectedStudyIds: string[];
  placeholder?: string;
  sendLabel?: string;
  thinkingLabel?: string;
}) {
  return (
    <Card className="flex h-[560px] flex-col overflow-hidden">
      <GlobalAgentPanel className="min-h-0 flex-1" />
    </Card>
  );
}
