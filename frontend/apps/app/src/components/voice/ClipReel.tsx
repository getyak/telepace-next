"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, cn, EmptyState } from "@telepace/ui";
import { getMockClips } from "./mock-voice-data";

type ClipReelProps = {
  studyId: string;
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ClipReel({ studyId }: ClipReelProps) {
  const t = useTranslations("app.clips");
  const clips = useRef(getMockClips(studyId)).current;
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (clips.length === 0) {
    return (
      <EmptyState title={t("noClips")} description={t("noClipsDescription")} />
    );
  }

  const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);

  const handlePlayAll = () => {
    setIsPlayingAll((prev) => !prev);
    setActiveIndex(isPlayingAll ? null : 0);
  };

  return (
    <Card>
      <div className="flex flex-col gap-4 border-b border-hairline p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="overline">{t("reel")}</p>
          <p className="text-sm leading-relaxed text-body">
            {t("reelDescription")}
          </p>
        </div>
        <Button onClick={handlePlayAll} className="shrink-0">
          <svg
            width="12"
            height="14"
            viewBox="0 0 14 16"
            fill="currentColor"
            className="mr-2"
          >
            {isPlayingAll ? (
              <>
                <rect x="1" y="0" width="4" height="16" rx="1" />
                <rect x="9" y="0" width="4" height="16" rx="1" />
              </>
            ) : (
              <path d="M1 1.5v13a1 1 0 001.5.87l11-6.5a1 1 0 000-1.74l-11-6.5A1 1 0 001 1.5z" />
            )}
          </svg>
          {t("playAll")}
        </Button>
      </div>

      <ol className="divide-y divide-hairline">
        {clips.map((clip, index) => (
          <li
            key={clip.id}
            className={cn(
              "flex items-center gap-4 px-5 py-4 transition-colors",
              index === activeIndex && "bg-accent-soft/30",
            )}
          >
            <span className="w-5 shrink-0 text-center text-xs text-muted font-mono">
              {index + 1}
            </span>
            <span className="flex-1 min-w-0 truncate text-sm text-ink">
              {clip.theme}
            </span>
            <span className="shrink-0 text-xs text-muted font-mono">
              {t("duration", { duration: clip.duration })}
            </span>
          </li>
        ))}
      </ol>

      <div className="border-t border-hairline px-5 py-3 text-right">
        <span className="text-xs text-muted font-mono">
          {formatDuration(totalDuration)}
        </span>
      </div>
    </Card>
  );
}
