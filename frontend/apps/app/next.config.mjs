import createNextIntlPlugin from "next-intl/plugin";

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
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
