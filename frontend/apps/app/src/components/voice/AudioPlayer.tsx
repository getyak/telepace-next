"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, cn } from "@telepace/ui";

type AudioPlayerProps = {
  src: string;
  onTimeUpdate?: (time: number) => void;
};

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ src, onTimeUpdate }: AudioPlayerProps) {
  const t = useTranslations("app.voice");
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdate?.(audio.currentTime);
    };
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [onTimeUpdate]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, src]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const audio = audioRef.current;
      if (!audio) return;
      const time = parseFloat(e.target.value);
      audio.currentTime = time;
      setCurrentTime(time);
      onTimeUpdate?.(time);
    },
    [onTimeUpdate],
  );

  const cycleSpeed = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const currentIndex = SPEED_OPTIONS.indexOf(speed as (typeof SPEED_OPTIONS)[number]);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    const nextSpeed = SPEED_OPTIONS[nextIndex];
    audio.playbackRate = nextSpeed;
    setSpeed(nextSpeed);
  }, [speed]);

  const handleVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const vol = parseFloat(e.target.value);
    audio.volume = vol;
    setVolume(vol);
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Card
      className="p-5"
      role="group"
      aria-label={t("audioPlayer")}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Controls row */}
      <div className="flex items-center gap-4">
        {/* Play / Pause */}
        <button
          type="button"
          onClick={togglePlay}
          disabled={!src}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            "bg-accent text-white transition-colors",
            src ? "hover:bg-accent-hover" : "opacity-40 cursor-not-allowed",
          )}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor">
              <rect x="1" y="0" width="4" height="16" rx="1" />
              <rect x="9" y="0" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor">
              <path d="M1 1.5v13a1 1 0 001.5.87l11-6.5a1 1 0 000-1.74l-11-6.5A1 1 0 001 1.5z" />
            </svg>
          )}
        </button>

        {/* Time + seek bar */}
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="relative h-1.5 w-full rounded-pill bg-paper-sunken overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-pill bg-accent transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full cursor-pointer opacity-0"
              aria-label="Seek"
            />
          </div>
          <div className="flex justify-between text-xs text-muted font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Speed */}
        <button
          type="button"
          onClick={cycleSpeed}
          className="tp-press tp-press-control shrink-0 rounded-btn border border-hairline bg-paper px-2.5 py-1 text-xs font-mono text-body hover:bg-paper-sunken transition-colors"
          aria-label={`Speed ${speed}x`}
        >
          {speed}x
        </button>

        {/* Volume */}
        <div className="hidden sm:flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-muted shrink-0"
          >
            <path d="M2 5.5h2.5L8 2.5v11l-3.5-3H2a.5.5 0 01-.5-.5V6a.5.5 0 01.5-.5z" />
            {volume > 0 && <path d="M10.5 5.5a3 3 0 010 5" />}
            {volume > 0.5 && <path d="M12.5 3.5a6 6 0 010 9" />}
          </svg>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={handleVolume}
            className="w-16 cursor-pointer accent-accent"
            aria-label="Volume"
          />
        </div>
      </div>
    </Card>
  );
}
