import "@telepace/ui/globals.css";
import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { siteConfig } from "@telepace/config";
import { Toaster } from "@telepace/ui";

import { HttpErrorBridge } from "../components/toast/HttpErrorBridge";

// Self-hosted via next/font: no Google Fonts <link>, no FOUT, and every
// route group (marketing, app, auth, respondent) inherits the variables.
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const serif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.urls.home),
  title: {
    default: `${siteConfig.brand.name} — ${siteConfig.brand.tagline}`,
    template: `%s · ${siteConfig.brand.name}`,
  },
  description: siteConfig.brand.tagline,
  openGraph: {
    type: "website",
    siteName: siteConfig.brand.name,
    title: `${siteConfig.brand.name} — ${siteConfig.brand.tagline}`,
    description: siteConfig.brand.tagline,
    url: siteConfig.urls.home,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.brand.name} — ${siteConfig.brand.tagline}`,
    description: siteConfig.brand.tagline,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${serif.variable}`}
    >
      <body>
        {children}
        <Toaster />
        <HttpErrorBridge />
      </body>
    </html>
  );
}
