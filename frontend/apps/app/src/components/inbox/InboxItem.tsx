"use client";

import { useState } from "react";
import { Badge, Button, cn } from "@telepace/ui";
import type { InboxKind } from "./InboxFilters";

// Action audit trail entry
export type ActivityEntry = {
  action: string;
  timestamp: string; // ISO string
};

export type InboxItemData = {
  id: string;
  kind: InboxKind;
  study: string;
  body: string;
  time: string;
  urgent?: boolean;
  read?: boolean;
  activity: ActivityEntry[];
};

const kindVariant: Record<InboxKind, "danger" | "accent" | "neutral"> = {
  escalation: "danger",
  insight: "accent",
  progress: "neutral",
  system: "neutral",
};

// Action buttons vary by kind
const ACTION_MAP: Record<InboxKind, { label: string; action: string }[]> = {
  escalation: [
    { label: "Review", action: "review" },
    { label: "Acknowledge", action: "acknowledge" },
    { label: "Dismiss", action: "dismiss" },
  ],
  insight: [
    { label: "View study", action: "view_study" },
    { label: "Dismiss", action: "dismiss" },
  ],
  progress: [
    { label: "View study", action: "view_study" },
    { label: "Dismiss", action: "dismiss" },
  ],
  system: [{ label: "Dismiss", action: "dismiss" }],
};

type InboxItemProps = {
  item: InboxItemData;
  onAction: (itemId: string, action: string) => void;
};

function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InboxItem({ item, onAction }: InboxItemProps) {
  const [activityOpen, setActivityOpen] = useState(false);
  const actions = ACTION_MAP[item.kind];

  return (
    <article
      className={cn(
        "px-6 py-5 transition-colors",
        item.kind === "escalation" && "border-l-[3px] border-l-terracotta",
        !item.read && "bg-paper-elevated",
        item.read && "bg-paper",
      )}
    >
      {/* Main content row */}
      <div className="grid grid-cols-2 md:grid-cols-12 items-start gap-x-4 gap-y-2">
        <div className="md:col-span-2 flex items-center gap-2">
          {!item.read && (
            <span
              className="h-2 w-2 rounded-pill bg-accent shrink-0"
              aria-label="Unread"
            />
          )}
          <Badge variant={kindVariant[item.kind]}>{item.kind}</Badge>
        </div>
        <div className="text-right text-sm text-muted md:col-span-2 md:order-3">
          {item.time}
        </div>
        <div className="col-span-2 md:col-span-8 md:order-2">
          <p className="text-xs text-muted mb-1">{item.study}</p>
          <p className={item.urgent ? "text-ink font-medium" : "text-body"}>
            {item.body}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {actions.map((a) => (
          <Button
            key={a.action}
            variant={a.action === "dismiss" ? "ghost" : "secondary"}
            size="sm"
            onClick={() => onAction(item.id, a.action)}
          >
            {a.label}
          </Button>
        ))}

        {/* Activity trail toggle */}
        {item.activity.length > 0 && (
          <button
            type="button"
            onClick={() => setActivityOpen((prev) => !prev)}
            className="ml-auto text-xs text-muted hover:text-ink transition-colors"
            aria-expanded={activityOpen}
          >
            Activity ({item.activity.length}){" "}
            <span
              className={cn(
                "inline-block transition-transform",
                activityOpen && "rotate-180",
              )}
            >
              &#9662;
            </span>
          </button>
        )}
      </div>

      {/* Collapsible activity trail */}
      {activityOpen && item.activity.length > 0 && (
        <div className="mt-3 border-t border-hairline pt-3">
          <p className="text-xs font-medium text-muted mb-2">Activity</p>
          <ul className="space-y-1">
            {item.activity.map((entry, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-body">
                <span className="h-1 w-1 rounded-pill bg-muted shrink-0" />
                <span className="font-medium">{entry.action}</span>
                <span className="text-muted">
                  {formatActivityTime(entry.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
