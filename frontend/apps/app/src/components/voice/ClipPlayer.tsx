"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@telepace/ui";
import type { AudioClip } from "./mock-voice-data";

type ClipPlayerProps = {
  clip: AudioClip;
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ClipPlayer({ clip }: ClipPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !clip.audioSrc) return;

    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, clip.audioSrc]);

  const progress = clip.duration > 0 ? (currentTime / clip.duration) * 100 : 0;

  return (
    <div className="rounded-card border border-hairline bg-paper-elevated p-4">
      <audio ref={audioRef} src={clip.audioSrc} preload="metadata" />

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{clip.theme}</span>
        <span className="text-xs text-muted font-mono">
          {formatDuration(clip.duration)}
        </span>
      </div>

      {/* Transcript overlay text */}
      <p className="mt-3 text-sm leading-relaxed text-body">
        &ldquo;{clip.transcript}&rdquo;
      </p>

      {/* Compact controls */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!clip.audioSrc}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            "bg-accent text-white transition-colors",
            clip.audioSrc
              ? "hover:bg-accent-hover"
              : "opacity-40 cursor-not-allowed",
          )}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="12" height="14" viewBox="0 0 14 16" fill="currentColor">
              <rect x="1" y="0" width="4" height="16" rx="1" />
              <rect x="9" y="0" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="14" viewBox="0 0 14 16" fill="currentColor">
              <path d="M1 1.5v13a1 1 0 001.5.87l11-6.5a1 1 0 000-1.74l-11-6.5A1 1 0 001 1.5z" />
            </svg>
          )}
        </button>

        <div className="h-1.5 flex-1 rounded-pill bg-paper-sunken overflow-hidden">
          <div
            className="h-full rounded-pill bg-accent transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
