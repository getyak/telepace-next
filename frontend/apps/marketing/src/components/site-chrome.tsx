import Link from "next/link";
import { Button } from "@telepace/ui";
import { routes, siteConfig } from "@telepace/config";
import { MobileNav } from "./mobile-nav";

const NAV_LINKS = [
  { href: routes.product.voice, label: "Voice" },
  { href: routes.product.agent, label: "Agent" },
  { href: routes.pricing, label: "Pricing" },
  { href: routes.docs, label: "Docs" },
  { href: routes.mcp, label: "MCP" },
];

export function Nav() {
  return (
    <header className="border-b border-hairline sticky top-0 z-40 bg-paper/85 backdrop-blur">
      <div className="container-content flex items-center justify-between h-16">
        <Link href={routes.home} className="font-display text-xl">
          {siteConfig.brand.name}
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-body">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <Link href={routes.login} className="text-sm text-body hover:text-ink transition-colors">
            Sign in
          </Link>
          <Link href={routes.signup}>
            <Button size="sm">Start free</Button>
          </Link>
        </div>
        <MobileNav links={NAV_LINKS} />
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-paper py-16">
      <div className="container-content grid gap-10 md:grid-cols-4 text-sm text-muted">
        <div>
          <p className="font-display text-lg text-ink">{siteConfig.brand.name}</p>
          <p className="mt-2 max-w-xs">Voice-native user research for the agent era.</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="overline">Product</span>
          <Link href={routes.product.voice} className="hover:text-ink transition-colors">Voice</Link>
          <Link href={routes.product.agent} className="hover:text-ink transition-colors">Agent</Link>
          <Link href={routes.mcp} className="hover:text-ink transition-colors">MCP</Link>
          <Link href={routes.pricing} className="hover:text-ink transition-colors">Pricing</Link>
          <Link href={routes.demo} className="hover:text-ink transition-colors">Live demo</Link>
        </div>
        <div className="flex flex-col gap-2">
          <span className="overline">Company</span>
          <Link href={routes.customers} className="hover:text-ink transition-colors">Customers</Link>
          <Link href={routes.changelog} className="hover:text-ink transition-colors">Changelog</Link>
          <Link href={routes.careers} className="hover:text-ink transition-colors">Careers</Link>
          <Link href={routes.docs} className="hover:text-ink transition-colors">Docs</Link>
        </div>
        <div className="flex flex-col gap-2">
          <span className="overline">Legal</span>
          <Link href={routes.security} className="hover:text-ink transition-colors">Security</Link>
          <Link href={routes.privacy} className="hover:text-ink transition-colors">Privacy</Link>
          <Link href={routes.terms} className="hover:text-ink transition-colors">Terms</Link>
        </div>
      </div>
      <div className="container-content mt-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-muted">
        <p>© {new Date().getFullYear()} Telepace, Inc. All rights reserved.</p>
        <p>Made in the open.</p>
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
