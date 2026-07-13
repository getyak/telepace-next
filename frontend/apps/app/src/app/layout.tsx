import "@telepace/ui/globals.css";
import type { Metadata } from "next";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Inter, Instrument_Serif, Noto_Serif_SC } from "next/font/google";
import { siteConfig } from "@telepace/config";
import { Toaster } from "@telepace/ui";

import { HttpErrorBridge } from "../components/toast/HttpErrorBridge";
import type { ErrorsCopyTable } from "../lib/errors";

// Self-hosted via next/font: no Google Fonts <link>, no FOUT, and every
// route group (marketing, app, auth, respondent) inherits the variables.
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
// Load the true italic face too: the marketing heroes emphasize a word with
// <span className="italic"> — without the drawn italic the browser synthesizes
// a faux oblique, which undercuts the editorial serif exactly where it's most
// prominent. Instrument Serif ships an upright + a designed italic at 400.
const serif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-display",
});
// CJK display serif for zh headings (globals.css html:lang(zh) rules).
// preload:false — the browser fetches only the unicode-range slices a page
// actually uses, so latin visitors pay nothing.
const serifZh = Noto_Serif_SC({
  weight: "400",
  variable: "--font-display-zh",
  preload: false,
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations("common");
  const messages = await getMessages();
  const errorsCopy = messages.errors as ErrorsCopyTable;
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${serif.variable} ${serifZh.variable}`}
    >
      <body>
        {children}
        <Toaster dismissLabel={t("dismiss")} />
        <HttpErrorBridge copy={errorsCopy} />
      </body>
    </html>
  );
}
