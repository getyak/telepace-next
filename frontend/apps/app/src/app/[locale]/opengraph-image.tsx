import { ImageResponse } from "next/og";
import { siteConfig } from "@telepace/config";
import { colors } from "@telepace/ui/tokens";

export const runtime = "edge";
export const alt = `${siteConfig.brand.name} — ${siteConfig.brand.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Sourced from packages/ui/src/tokens.ts (plain-JS, edge-safe — no CSS import)
// so the OG card can't silently drift from the palette.
const PAPER = colors.paper;
const INK = colors.ink;
const MUTED = colors.muted;
const ACCENT = colors.accent;

// The edge runtime can't await next-intl/server's async getTranslations here,
// so headline copy is a small inline table instead of a messages/ lookup.
const HEADLINE: Record<string, string> = {
  en: "Understand what people actually want, and why.",
  zh: "理解用户真正想要什么，以及原因。",
};

const TAGLINE: Record<string, string> = {
  en: siteConfig.brand.tagline,
  zh: "语音原生、Agent 优先的用户研究基础设施",
};

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const headline = HEADLINE[locale] ?? HEADLINE.en;
  const tagline = TAGLINE[locale] ?? TAGLINE.en;
  const bars = [28, 52, 76, 52, 28];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          color: INK,
          padding: 80,
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 40 }}>{siteConfig.brand.name}</div>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            maxWidth: 900,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", fontSize: 28, color: MUTED }}>
            {tagline}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {bars.map((h, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  width: 10,
                  height: h,
                  borderRadius: 999,
                  background: ACCENT,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
