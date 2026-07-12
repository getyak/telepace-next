"use client";

import { useTranslations } from "next-intl";
import { Button } from "@telepace/ui";

interface UndoRedoBarProps {
  canUndo: boolean;
  canRedo: boolean;
  changeCount: number;
  onUndo: () => void;
  onRedo: () => void;
}

function UndoGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

function RedoGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
    </svg>
  );
}

export function UndoRedoBar({
  canUndo,
  canRedo,
  changeCount,
  onUndo,
  onRedo,
}: UndoRedoBarProps) {
  const t = useTranslations("app.versions");

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canUndo}
          onClick={onUndo}
          title={`${t("undo")} (Ctrl+Z)`}
          aria-label={t("undo")}
        >
          <UndoGlyph />
          <span className="ml-1">{t("undo")}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canRedo}
          onClick={onRedo}
          title={`${t("redo")} (Ctrl+Shift+Z)`}
          aria-label={t("redo")}
        >
          <RedoGlyph />
          <span className="ml-1">{t("redo")}</span>
        </Button>
      </div>
      <span className="font-mono text-xs text-muted">
        {t("changes", { count: changeCount })}
      </span>
    </div>
  );
}
