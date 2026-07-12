"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@telepace/ui";

const ACCEPTED = ".docx,.pdf,.txt,.md";

interface FileUploadProps {
  onChange: (file: File) => void;
}

export function FileUpload({ onChange }: FileUploadProps) {
  const t = useTranslations("app.templates");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onChange(file);
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-2xl text-ink">{t("importTitle")}</h2>
        <p className="mt-1 text-sm text-body">{t("importDescription")}</p>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed px-6 py-12 text-center transition-colors",
          dragging
            ? "border-accent bg-accent-soft"
            : "border-hairline bg-paper-elevated hover:border-accent hover:bg-accent-soft/40",
        )}
      >
        <UploadIcon className="h-8 w-8 text-accent" />
        <span className="font-medium text-ink">{t("uploadLabel")}</span>
        <span className="text-xs text-muted">{t("uploadHint")}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
