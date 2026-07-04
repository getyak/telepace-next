import "@telepace/ui/globals.css";
import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { siteConfig } from "@telepace/config";

import { AuthProvider } from "../lib/auth/AuthProvider";
import { ToastBridge } from "../components/toast/ToastBridge";
import { Sidebar } from "../components/app/Sidebar";
import { MobileNav } from "../components/app/MobileNav";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-display" });

export const metadata: Metadata = { title: siteConfig.brand.name };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body>
        <AuthProvider>
          <div className="min-h-screen flex flex-col md:flex-row">
            <MobileNav />
            <Sidebar />
            <main className="flex-1 min-w-0">{children}</main>
          </div>
          <ToastBridge />
        </AuthProvider>
      </body>
    </html>
  );
}
