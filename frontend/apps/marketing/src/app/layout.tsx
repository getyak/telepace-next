import "@telepace/ui/globals.css";
import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { siteConfig } from "@telepace/config";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.urls.home),
  title: "telepace — the voice-native user research infrastructure",
  description: siteConfig.brand.tagline,
  openGraph: {
    type: "website",
    siteName: siteConfig.brand.name,
    title: "telepace — the voice-native user research infrastructure",
    description: siteConfig.brand.tagline,
    url: siteConfig.urls.home,
  },
  twitter: {
    card: "summary_large_image",
    title: "telepace — the voice-native user research infrastructure",
    description: siteConfig.brand.tagline,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
