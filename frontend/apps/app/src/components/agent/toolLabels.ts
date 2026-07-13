/**
 * Maps orchestrator tool names → localized status verbs for the tool-activity
 * cards ("creating study…" / "created study"). Keeps the panel readable when
 * the agent chains several tools. The label copy itself is resolved by the
 * caller via next-intl; this only maps a tool name to a message key.
 */

export type ToolPhase = "running" | "done" | "error";

/** i18n key suffix under app.agent.tool.* for a given tool + phase. */
export function toolMessageKey(name: string): string {
  // Unknown tools fall back to a generic "working" label.
  const KNOWN = new Set([
    "create_campaign",
    "get_campaign_progress",
    "get_campaign_insights",
    "ask_followup",
    "push_insights",
    "list_campaigns",
    "refine_outline",
    "start_campaign",
    "dispatch_invites",
  ]);
  return KNOWN.has(name) ? name : "generic";
}

/**
 * Pull a human-facing link target out of a tool result, if any. create_campaign
 * / start_campaign return a campaign_id we can deep-link to; that lets a tool
 * card become a clickable "View study" affordance.
 */
export function campaignIdFromResult(
  result: Record<string, unknown> | undefined,
): string | null {
  if (!result) return null;
  const id = result["campaign_id"];
  return typeof id === "string" ? id : null;
}
