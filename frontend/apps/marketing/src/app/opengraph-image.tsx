import { ImageResponse } from "next/og";
import { siteConfig } from "@telepace/config";
import { colors } from "@telepace/ui/tokens";

export const runtime = "edge";
export const alt = siteConfig.brand.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: colors.paper,
          color: colors.ink,
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: colors.muted, letterSpacing: 4, textTransform: "uppercase" }}>
          {siteConfig.brand.name}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 64,
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          {siteConfig.brand.tagline}
        </div>
        <div style={{ display: "flex", position: "absolute", right: 80, bottom: 72, gap: 6, alignItems: "flex-end" }}>
          {[18, 34, 46, 30, 20, 40, 26].map((h, i) => (
            <div
              key={i}
              style={{ width: 10, height: h, borderRadius: 4, background: colors.accent }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
