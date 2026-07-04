import "@telepace/ui/globals.css";
import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { siteConfig } from "@telepace/config";

import { AuthProvider } from "@/lib/auth/AuthProvider";
import { ToastBridge } from "@/components/toast/ToastBridge";

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

const description =
  "Your Claude, Cursor, and Codex can interview 100 users while you sleep — and wake up to structured insights they can act on.";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.urls.home),
  title: {
    default: "telepace — the voice-native user research infrastructure",
    template: "%s · telepace",
  },
  description,
  openGraph: {
    type: "website",
    siteName: siteConfig.brand.name,
    title: "telepace — the voice-native user research infrastructure",
    description,
    url: siteConfig.urls.home,
  },
  twitter: {
    card: "summary_large_image",
    title: "telepace — the voice-native user research infrastructure",
    description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body>
        <AuthProvider>
          {children}
          <ToastBridge />
        </AuthProvider>
      </body>
    </html>
  );
}
