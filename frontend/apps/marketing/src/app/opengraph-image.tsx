import { ImageResponse } from "next/og";
import { siteConfig } from "@telepace/config";

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
          background: "#F8F6F1",
          color: "#141414",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 4, textTransform: "uppercase", color: "#8A857F" }}>
          {siteConfig.brand.name}
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 72,
            lineHeight: 1.1,
            maxWidth: 920,
            fontFamily: "serif",
          }}
        >
          {siteConfig.brand.tagline}
        </div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "flex-end", gap: 4, height: 40 }}>
          {[0.4, 0.7, 1, 0.55, 0.85, 0.3, 0.6].map((h, i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: `${h * 100}%`,
                background: "#4A5D3B",
                borderRadius: 4,
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
