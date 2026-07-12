import { useTranslations } from "next-intl";
import { cn } from "@telepace/ui";
import type { VoiceMetricsData } from "./mock-voice-data";

type VoiceMetricsProps = {
  metrics: VoiceMetricsData;
};

function sentimentColor(value: number): string {
  if (value > 0.3) return "text-success";
  if (value > -0.1) return "text-warning";
  return "text-danger";
}

function sentimentLabelKey(value: number): "positive" | "neutral" | "negative" {
  if (value > 0.3) return "positive";
  if (value > -0.1) return "neutral";
  return "negative";
}

function sentimentDotColor(value: number): string {
  if (value > 0.3) return "bg-success";
  if (value > -0.1) return "bg-warning";
  return "bg-danger";
}

function formatMs(ms: number): string {
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

// Bar colors cycle through the design palette
const BAR_COLORS = [
  "bg-accent",
  "bg-terracotta",
  "bg-success",
  "bg-warning",
  "bg-danger",
];

export function VoiceMetrics({ metrics }: VoiceMetricsProps) {
  const t = useTranslations("app.voice");
  const paceInRange = metrics.pace_wpm >= 120 && metrics.pace_wpm <= 150;

  return (
    <div className="space-y-4">
      {/* Metric cards grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Sentiment */}
        <div className="rounded-card border border-hairline bg-paper-elevated p-5">
          <p className="overline mb-2">{t("sentiment")}</p>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-3 w-3 rounded-full",
                sentimentDotColor(metrics.avg_sentiment),
              )}
            />
            <span
              className={cn(
                "font-display text-2xl",
                sentimentColor(metrics.avg_sentiment),
              )}
            >
              {t(sentimentLabelKey(metrics.avg_sentiment))}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted font-mono">
            score: {metrics.avg_sentiment.toFixed(2)}
          </p>
        </div>

        {/* Pace */}
        <div className="rounded-card border border-hairline bg-paper-elevated p-5">
          <p className="overline mb-2">{t("pace")}</p>
          <p
            className={cn(
              "font-display text-2xl",
              paceInRange ? "text-ink" : "text-terracotta",
            )}
          >
            {metrics.pace_wpm}{" "}
            <span className="text-sm font-sans text-muted">wpm</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            Normal range: 120&ndash;150 wpm
          </p>
        </div>

        {/* Pauses */}
        <div className="rounded-card border border-hairline bg-paper-elevated p-5">
          <p className="overline mb-2">{t("pauses")}</p>
          <p className="font-display text-2xl text-ink">
            {metrics.pause_count}
          </p>
          <p className="mt-1 text-xs text-muted">total pauses detected</p>
        </div>

        {/* Longest pause */}
        <div className="rounded-card border border-hairline bg-paper-elevated p-5">
          <p className="overline mb-2">Longest pause</p>
          <p className="font-display text-2xl text-ink">
            {formatMs(metrics.longest_pause_ms)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {metrics.longest_pause_ms}ms
          </p>
        </div>
      </div>

      {/* Emotion distribution */}
      <div className="rounded-card border border-hairline bg-paper-elevated p-5">
        <p className="overline mb-4">{t("emotion")}</p>
        <div className="space-y-3">
          {metrics.emotion_distribution.map((emotion, index) => (
            <div key={emotion.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-body">{emotion.label}</span>
                <span className="font-mono text-xs text-muted">
                  {Math.round(emotion.value * 100)}%
                </span>
              </div>
              <div className="h-2 w-full rounded-pill bg-paper-sunken overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-pill transition-[width] duration-300",
                    BAR_COLORS[index % BAR_COLORS.length],
                  )}
                  style={{ width: `${emotion.value * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
