"use client";

import { useTranslations } from "next-intl";
import { Input, Label } from "@telepace/ui";

type OutlineItem = {
  order: number;
  question: string;
  goal: string;
  max_followups?: number;
  branch_if_positive?: string | null;
  branch_if_negative?: string | null;
};

interface FollowUpConfigProps {
  item: OutlineItem;
  onChange: (updated: OutlineItem) => void;
}

// Visibility is controlled by the parent (gear icon toggle).
// This component renders its fields directly -- no inner collapsible.
export function FollowUpConfig({ item, onChange }: FollowUpConfigProps) {
  const t = useTranslations("app.followups");

  return (
    <div className="mt-3 pt-3 border-t border-hairline space-y-3">
      <p className="text-xs font-medium text-muted">{t("configureTitle")}</p>

      {/* Max follow-ups */}
      <div>
        <Label>{t("maxFollowups")}</Label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={5}
            value={item.max_followups ?? 0}
            onChange={(e) =>
              onChange({ ...item, max_followups: Number(e.target.value) })
            }
            className="flex-1 accent-[#4A5D3B]"
          />
          <span className="font-mono text-sm text-muted w-4 text-center">
            {item.max_followups ?? 0}
          </span>
        </div>
      </div>

      {/* Branch if positive */}
      <div>
        <Label>{t("branchPositive")}</Label>
        <Input
          value={item.branch_if_positive ?? ""}
          placeholder={t("branchPlaceholder")}
          onChange={(e) =>
            onChange({
              ...item,
              branch_if_positive: e.target.value || null,
            })
          }
        />
      </div>

      {/* Branch if negative */}
      <div>
        <Label>{t("branchNegative")}</Label>
        <Input
          value={item.branch_if_negative ?? ""}
          placeholder={t("branchPlaceholder")}
          onChange={(e) =>
            onChange({
              ...item,
              branch_if_negative: e.target.value || null,
            })
          }
        />
      </div>
    </div>
  );
}
