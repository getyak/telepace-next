import "@telepace/ui/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "telepace — the voice-native user research infrastructure",
  description:
    "Your Claude, Cursor, and Codex can interview 100 users while you sleep — and wake up to structured insights they can act on.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
