import "@telepace/ui/globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { routes, siteConfig } from "@telepace/config";

import { AuthProvider } from "../lib/auth/AuthProvider";
import { Toaster } from "../components/toast/Toaster";
import { UserMenu } from "../components/user/UserMenu";

export const metadata: Metadata = { title: siteConfig.brand.name };

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
      <body>
        <AuthProvider>
          <div className="min-h-screen flex">
            <aside className="w-[240px] shrink-0 border-r border-hairline bg-paper-elevated hidden md:flex flex-col">
              <div className="px-5 py-5 border-b border-hairline">
                <Link href={routes.app.root} className="font-display text-xl">
                  {siteConfig.brand.name}
                </Link>
              </div>
              <nav className="flex-1 px-3 py-4 space-y-1 text-sm text-body">
                <SideLink href={routes.app.root}>Studies</SideLink>
                <SideLink href={routes.app.inbox}>Inbox</SideLink>
                <SideLink href={routes.app.audience}>Audience</SideLink>
                <SideLink href={routes.app.insights}>Insights</SideLink>
                <SideLink href={routes.app.integrations}>Integrations</SideLink>
                <SideLink href={routes.app.settings}>Settings</SideLink>
              </nav>
              <UserMenu />
            </aside>
            <main className="flex-1 min-w-0">{children}</main>
          </div>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}

function SideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-btn px-3 py-2 text-body hover:bg-paper hover:text-ink transition-colors"
    >
      {children}
    </Link>
  );
}
