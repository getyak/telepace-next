import Link from "next/link";
import { Button } from "@telepace/ui";

export function Nav() {
  return (
    <header className="border-b border-hairline sticky top-0 z-40 bg-paper/85 backdrop-blur">
      <div className="container-content flex items-center justify-between h-16">
        <Link href="/" className="font-display text-xl">
          telepace
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-body">
          <Link href="/product/voice" className="hover:text-ink transition-colors">Voice</Link>
          <Link href="/product/agent" className="hover:text-ink transition-colors">Agent</Link>
          <Link href="/pricing" className="hover:text-ink transition-colors">Pricing</Link>
          <Link href="/docs" className="hover:text-ink transition-colors">Docs</Link>
          <Link href="/mcp" className="hover:text-ink transition-colors">MCP</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-body hover:text-ink transition-colors">
            Log in
          </Link>
          <Link href="/signup">
            <Button size="sm">Start free</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-paper py-16">
      <div className="container-content grid gap-10 md:grid-cols-4 text-sm text-muted">
        <div>
          <p className="font-display text-lg text-ink">telepace</p>
          <p className="mt-2 max-w-xs">Voice-native user research for the agent era.</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="overline">Product</span>
          <Link href="/product/voice" className="hover:text-ink transition-colors">Voice</Link>
          <Link href="/product/agent" className="hover:text-ink transition-colors">Agent</Link>
          <Link href="/mcp" className="hover:text-ink transition-colors">MCP</Link>
          <Link href="/pricing" className="hover:text-ink transition-colors">Pricing</Link>
          <Link href="/demo" className="hover:text-ink transition-colors">Live demo</Link>
        </div>
        <div className="flex flex-col gap-2">
          <span className="overline">Company</span>
          <Link href="/customers" className="hover:text-ink transition-colors">Customers</Link>
          <Link href="/changelog" className="hover:text-ink transition-colors">Changelog</Link>
          <Link href="/careers" className="hover:text-ink transition-colors">Careers</Link>
          <Link href="/docs" className="hover:text-ink transition-colors">Docs</Link>
        </div>
        <div className="flex flex-col gap-2">
          <span className="overline">Legal</span>
          <Link href="/security" className="hover:text-ink transition-colors">Security</Link>
          <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
        </div>
      </div>
      <div className="container-content mt-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-muted">
        <p>© {new Date().getFullYear()} Telepace, Inc. All rights reserved.</p>
        <p>Made in the open. SOC 2 Type II in progress.</p>
      </div>
    </footer>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
}) {
  return (
    <section className="border-b border-hairline">
      <div className="container-content py-20 md:py-28 max-w-3xl">
        <p className="overline mb-5">{eyebrow}</p>
        <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.05]">{title}</h1>
        {lede && <p className="mt-6 text-body text-lg leading-relaxed max-w-2xl">{lede}</p>}
      </div>
    </section>
  );
}
