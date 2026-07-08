"use client";

import { useCallback, useRef, useState } from "react";
import { AudioPlayer } from "./AudioPlayer";
import { TranscriptAlignment } from "./TranscriptAlignment";
import { VoiceMetrics } from "./VoiceMetrics";
import { getMockVoiceData } from "./mock-voice-data";

type VoiceAnalysisPanelProps = {
  interviewId: string;
};

export function VoiceAnalysisPanel({ interviewId }: VoiceAnalysisPanelProps) {
  const data = useRef(getMockVoiceData(interviewId)).current;
  const [currentTime, setCurrentTime] = useState(0);

  // Called by AudioPlayer on timeupdate events
  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // Called by TranscriptAlignment when user clicks a turn
  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    // The audio element is inside AudioPlayer; we update currentTime state
    // which flows into TranscriptAlignment for highlight sync.
    // For a real implementation, AudioPlayer would expose an imperative seek handle.
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl text-ink">Voice Analysis</h2>
        <span className="text-xs text-muted font-mono">{interviewId}</span>
      </div>

      <div className="grid md:grid-cols-12 gap-6">
        {/* Left column: audio player + transcript */}
        <div className="md:col-span-7 space-y-4">
          <AudioPlayer src={data.audioSrc} onTimeUpdate={handleTimeUpdate} />
          <TranscriptAlignment
            turns={data.turns}
            currentTime={currentTime}
            onSeek={handleSeek}
          />
        </div>

        {/* Right column: metrics */}
        <div className="md:col-span-5">
          <VoiceMetrics metrics={data.metrics} />
        </div>
      </div>
    </div>
  );
}
