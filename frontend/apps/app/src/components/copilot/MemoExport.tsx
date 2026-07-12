"use client";

import { Button, toast } from "@telepace/ui";

export function MemoExport({
  exportLabel,
  notionLabel,
  linearLabel,
}: {
  exportLabel: string;
  notionLabel: string;
  linearLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => toast.success({ title: exportLabel })}>
        {exportLabel}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => toast.info({ title: notionLabel })}
      >
        {notionLabel}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => toast.info({ title: linearLabel })}
      >
        {linearLabel}
      </Button>
    </div>
  );
}
