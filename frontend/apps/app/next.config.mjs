import createNextIntlPlugin from "next-intl/plugin";

const configuredEmbedOrigins = (process.env.TELEPACE_EMBED_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => /^https?:\/\/[^/\s]+$/.test(origin));
const embedOrigins = [
  "https://cubxxw.com",
  "https://www.cubxxw.com",
  ...(process.env.NODE_ENV === "development"
    ? ["http://localhost:*", "http://127.0.0.1:*"]
    : []),
  ...configuredEmbedOrigins,
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@telepace/ui"],
  experimental: {
    // Tree-shake barrel re-exports so importing one symbol from a package's
    // index doesn't pull the whole module graph into every page that touches
    // it. @telepace/ui's index re-exports heavy Chat/Voice components and
    // @telepace/icons is a 237-line icon barrel — a login page that uses a
    // handful of them shouldn't compile the whole set. Biggest low-risk win for
    // per-page module count (login compiled ~892 modules before).
    optimizePackageImports: ["@telepace/ui", "@telepace/icons", "recharts"],
  },
  async headers() {
    return [
      {
        source: "/:locale/r/:campaignId",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self' ${[...new Set(embedOrigins)].join(" ")}`,
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/embed/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
