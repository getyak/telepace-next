"use client";

import { useTranslations } from "next-intl";
import { Label, cn } from "@telepace/ui";
import { ALL_CHANNELS } from "@telepace/config";
import { WelcomeEndConfig } from "./WelcomeEndConfig";
import type { WizardSettings } from "./types";

interface StepSettingsProps {
  channels: string[];
  targetCompletions: number;
  settings: WizardSettings;
  onChannelsChange: (channels: string[]) => void;
  onTargetChange: (value: number) => void;
  onSettingsChange: (patch: Partial<WizardSettings>) => void;
}

export function StepSettings({
  channels,
  targetCompletions,
  settings,
  onChannelsChange,
  onTargetChange,
  onSettingsChange,
}: StepSettingsProps) {
  const t = useTranslations("app.wizard");

  function toggleChannel(ch: string) {
    onChannelsChange(
      channels.includes(ch)
        ? channels.filter((c) => c !== ch)
        : [...channels, ch],
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl text-ink">{t("settingsTitle")}</h1>

      <div className="space-y-3">
        <Label>{t("stepSettings")}</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_CHANNELS.map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => toggleChannel(ch)}
              className={cn(
                "px-3 py-1.5 rounded-pill text-sm border transition-colors",
                channels.includes(ch)
                  ? "bg-ink text-paper border-ink"
                  : "bg-paper text-body border-hairline hover:border-ink",
              )}
            >
              {ch.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>{t("reviewQuestionCount", { count: targetCompletions })}</Label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={100}
            value={targetCompletions}
            onChange={(e) => onTargetChange(Number(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="font-mono text-sm text-muted w-8 text-center">
            {targetCompletions}
          </span>
        </div>
      </div>

      <WelcomeEndConfig spec={settings} onChange={onSettingsChange} />
    </div>
  );
}
