import { ImageResponse } from "next/og";
import { siteConfig } from "@telepace/config";

export const runtime = "edge";
export const alt = `${siteConfig.brand.name} — ${siteConfig.brand.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Colors mirror packages/ui/src/tokens.ts (ImageResponse can't import CSS).
const PAPER = "#F8F6F1";
const INK = "#141414";
const MUTED = "#8A857F";
const ACCENT = "#4A5D3B";

export default function OpengraphImage() {
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
          Understand what people actually want, and why.
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
            {siteConfig.brand.tagline}
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
