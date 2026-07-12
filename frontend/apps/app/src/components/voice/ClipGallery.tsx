"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, cn, EmptyState } from "@telepace/ui";
import { getMockClips, type AudioClip } from "./mock-voice-data";
import { ClipPlayer } from "./ClipPlayer";

type ClipGalleryProps = {
  studyId: string;
};

export function ClipGallery({ studyId }: ClipGalleryProps) {
  const t = useTranslations("app.clips");
  const clips = useRef(getMockClips(studyId)).current;
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  if (clips.length === 0) {
    return (
      <EmptyState title={t("noClips")} description={t("noClipsDescription")} />
    );
  }

  const activeClip = clips.find((c) => c.id === activeClipId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl text-ink">{t("title")}</h2>
        <span className="text-xs text-muted font-mono">{clips.length}</span>
      </div>

      {activeClip && <ClipPlayer clip={activeClip} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clips.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            isActive={clip.id === activeClipId}
            onPlay={() => setActiveClipId(clip.id)}
            durationLabel={t("duration", { duration: clip.duration })}
          />
        ))}
      </div>
    </div>
  );
}

type ClipCardProps = {
  clip: AudioClip;
  isActive: boolean;
  onPlay: () => void;
  durationLabel: string;
};

function ClipCard({ clip, isActive, onPlay, durationLabel }: ClipCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-card border bg-paper-elevated p-5 transition-colors",
        isActive ? "border-accent/40 bg-accent-soft/20" : "border-hairline",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Badge>{clip.theme}</Badge>
        <span className="shrink-0 text-xs text-muted font-mono">
          {durationLabel}
        </span>
      </div>

      <p className="line-clamp-2 text-sm leading-relaxed text-body">
        {clip.transcript}
      </p>

      <button
        type="button"
        onClick={onPlay}
        aria-label={clip.theme}
        className={cn(
          "mt-1 flex items-center gap-2 self-start rounded-btn border px-3 py-1.5 text-sm transition-colors",
          isActive
            ? "border-accent/40 bg-accent-soft text-accent"
            : "border-hairline bg-paper text-body hover:bg-paper-sunken",
        )}
      >
        <svg width="12" height="14" viewBox="0 0 14 16" fill="currentColor">
          <path d="M1 1.5v13a1 1 0 001.5.87l11-6.5a1 1 0 000-1.74l-11-6.5A1 1 0 001 1.5z" />
        </svg>
        {clip.theme}
      </button>
    </div>
  );
}
