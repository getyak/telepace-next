"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Badge, ProgressBar, cn } from "@telepace/ui";

import { useRouter } from "@/i18n/navigation";
import {
  completionFraction,
  isLiveStatus,
  studyStatusVariant,
} from "./studyStatus";

/**
 * One campaign as returned by the `list_campaigns` tool. The MCP contract emits
 * these fields (see interfaces/mcp_server/tools/list_campaigns.py); the agent
 * chat receives them verbatim in a tool_result event.
 */
export type CampaignSummary = {
  campaign_id: string;
  title: string;
  status: string;
  completed: number;
  target_completions: number;
};

/** Narrow an unknown tool_result payload to a campaigns array, or null. */
export function campaignsFromResult(
  result: Record<string, unknown> | undefined,
): CampaignSummary[] | null {
  if (!result) return null;
  const raw = result["campaigns"];
  if (!Array.isArray(raw)) return null;
  const out: CampaignSummary[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (typeof c.campaign_id !== "string" || typeof c.title !== "string") continue;
    out.push({
      campaign_id: c.campaign_id,
      title: c.title,
      status: typeof c.status === "string" ? c.status : "draft",
      completed: typeof c.completed === "number" ? c.completed : 0,
      target_completions:
        typeof c.target_completions === "number" ? c.target_completions : 0,
    });
  }
  return out;
}

/**
 * The structured answer to "list my studies" — a column of compact study cards
 * rendered from the tool's real data, NOT from LLM-composed markdown. Each card
 * carries a status badge, a completion progress bar and a click-through to the
 * study, so a wall of `- title – 0/10` prose becomes a scannable, actionable
 * list. Tuned for the narrow (≤420px) agent drawer: single column, tight type.
 */
export function CampaignListCard({ campaigns }: { campaigns: CampaignSummary[] }) {
  const t = useTranslations("app.studies");
  const tAgent = useTranslations("app.agent");
  const router = useRouter();

  const statusLabel: Record<string, string> = {
    live: t("statusLive"),
    ready: t("statusReady"),
    draft: t("statusDraft"),
    closed: t("statusClosed"),
  };

  if (campaigns.length === 0) return null;

  return (
    <div className="tp-chip-in flex flex-col gap-2" role="list">
      {campaigns.map((c) => {
        const live = isLiveStatus(c.status);
        const closed = c.status === "closed";
        return (
          <button
            key={c.campaign_id}
            type="button"
            role="listitem"
            onClick={() => router.push(`/studies/${c.campaign_id}`)}
            className={cn(
              "group flex flex-col gap-2 rounded-card border border-hairline bg-paper-elevated px-3.5 py-2.5 text-left",
              "transition-[border-color,background-color,transform] duration-150",
              "tp-press tp-press-card hover:border-ink/20 hover:bg-paper",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p
                className={cn(
                  "min-w-0 flex-1 truncate font-display text-[15px] leading-snug",
                  closed ? "text-muted" : "text-ink",
                )}
              >
                {c.title}
              </p>
              <Badge
                variant={studyStatusVariant[c.status] ?? "neutral"}
                className={cn("shrink-0", closed && "opacity-70")}
              >
                {live && (
                  <span className="tp-pulse-slow inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                )}
                {statusLabel[c.status] ?? c.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2.5">
              <ProgressBar
                className="flex-1"
                value={completionFraction(c.completed, c.target_completions)}
                tone={live ? "accent" : "muted"}
                label={t("completedCount", {
                  completed: c.completed,
                  target: c.target_completions,
                })}
              />
              <span className="shrink-0 font-mono text-xs text-body">
                {c.completed}
                <span className="text-muted">/{c.target_completions}</span>
              </span>
              <span
                aria-hidden
                className="shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-0.5"
              >
                &rarr;
              </span>
            </div>
            <span className="sr-only">{tAgent("viewStudy")}</span>
          </button>
        );
      })}
    </div>
  );
}
