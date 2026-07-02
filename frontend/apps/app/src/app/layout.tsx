import "@telepace/ui/globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "telepace" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="min-h-screen flex">
          <aside className="w-[240px] shrink-0 border-r border-hairline bg-paper-elevated hidden md:flex flex-col">
            <div className="px-5 py-5 border-b border-hairline">
              <Link href="/" className="font-display text-xl">
                telepace
              </Link>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 text-sm text-body">
              <SideLink href="/">Studies</SideLink>
              <SideLink href="/inbox">Inbox</SideLink>
              <SideLink href="/audience">Audience</SideLink>
              <SideLink href="/insights">Insights</SideLink>
              <SideLink href="/integrations">Integrations</SideLink>
              <SideLink href="/settings">Settings</SideLink>
            </nav>
            <div className="p-4 border-t border-hairline text-xs text-muted">
              Free plan · 2 / 3 studies
            </div>
          </aside>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
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
