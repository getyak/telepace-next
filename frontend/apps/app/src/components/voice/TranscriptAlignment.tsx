"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@telepace/ui";
import type { TranscriptTurn } from "./mock-voice-data";

type TranscriptAlignmentProps = {
  turns: TranscriptTurn[];
  currentTime: number;
  onSeek: (time: number) => void;
};

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function TranscriptAlignment({
  turns,
  currentTime,
  onSeek,
}: TranscriptAlignmentProps) {
  const t = useTranslations("app.voice");
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to keep the active turn visible
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [currentTime]);

  return (
    <div className="rounded-card border border-hairline bg-paper-elevated">
      <div className="border-b border-hairline px-5 py-3">
        <p className="overline">{t("transcript")}</p>
      </div>

      <div
        ref={containerRef}
        className="max-h-[420px] overflow-y-auto divide-y divide-hairline"
      >
        {turns.map((turn) => {
          const isActive =
            currentTime >= turn.start_time && currentTime < turn.end_time;
          const isInterviewer = turn.role === "interviewer";

          return (
            <button
              key={turn.id}
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => onSeek(turn.start_time)}
              title={t("clickToSeek")}
              className={cn(
                "w-full text-left px-5 py-4 transition-colors",
                "hover:bg-paper-sunken/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset",
                isActive && "bg-accent-soft/40",
              )}
            >
              <div className="flex items-start gap-3">
                {/* Role indicator */}
                <div
                  className={cn(
                    "mt-0.5 shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                    isInterviewer
                      ? "bg-accent-soft text-accent border border-accent/20"
                      : "bg-terracotta/10 text-terracotta border border-terracotta/20",
                  )}
                >
                  {isInterviewer ? "Q" : "A"}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm leading-relaxed",
                      isActive ? "text-ink" : "text-body",
                    )}
                  >
                    {turn.text}
                  </p>
                  <p className="mt-1.5 text-xs text-muted font-mono">
                    {formatTimestamp(turn.start_time)} &ndash;{" "}
                    {formatTimestamp(turn.end_time)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
