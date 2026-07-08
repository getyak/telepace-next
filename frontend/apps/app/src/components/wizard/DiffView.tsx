"use client";

import { useTranslations } from "next-intl";
import { cn } from "@telepace/ui";

type Diffable = Record<string, unknown>;

type FieldChange =
  | { kind: "added"; key: string; next: unknown }
  | { kind: "removed"; key: string; prev: unknown }
  | { kind: "modified"; key: string; prev: unknown; next: unknown };

interface DiffViewProps {
  before: Diffable;
  after: Diffable;
}

function format(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function computeDiff(before: Diffable, after: Diffable): FieldChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: FieldChange[] = [];
  for (const key of keys) {
    const inBefore = key in before;
    const inAfter = key in after;
    if (inBefore && !inAfter) {
      changes.push({ kind: "removed", key, prev: before[key] });
    } else if (!inBefore && inAfter) {
      changes.push({ kind: "added", key, next: after[key] });
    } else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes.push({
        kind: "modified",
        key,
        prev: before[key],
        next: after[key],
      });
    }
  }
  return changes;
}

export function DiffView({ before, after }: DiffViewProps) {
  const t = useTranslations("app.versions");
  const changes = computeDiff(before, after);

  const kindStyles: Record<FieldChange["kind"], string> = {
    added: "bg-green-500/10 text-green-700 border-green-500/30",
    removed: "bg-red-500/10 text-red-700 border-red-500/30",
    modified: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
  };

  const kindLabels: Record<FieldChange["kind"], string> = {
    added: t("diffAdded"),
    removed: t("diffRemoved"),
    modified: t("diffModified"),
  };

  return (
    <ul className="space-y-2">
      {changes.map((change) => (
        <li
          key={`${change.kind}-${change.key}`}
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            kindStyles[change.kind],
          )}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wide">
              {kindLabels[change.kind]}
            </span>
            <span className="font-medium">{change.key}</span>
          </div>
          <div className="mt-1 font-mono text-xs break-words">
            {change.kind === "modified" ? (
              <>
                <span className="line-through opacity-70">
                  {format(change.prev)}
                </span>
                <span aria-hidden="true"> → </span>
                <span>{format(change.next)}</span>
              </>
            ) : change.kind === "added" ? (
              format(change.next)
            ) : (
              <span className="line-through opacity-70">
                {format(change.prev)}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
