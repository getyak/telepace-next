import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { routes, siteConfig } from "@telepace/config";

import { MobileNav, type NavLink } from "./MobileNav";
import { MarketingUserMenu, type MarketingUserMenuLabels } from "./MarketingUserMenu";

const NAV_ITEMS: { href: string; labelKey: "voice" | "agent" | "pricing" | "docs" | "mcp" }[] = [
  { href: routes.product.voice, labelKey: "voice" },
  { href: routes.product.agent, labelKey: "agent" },
  { href: routes.pricing, labelKey: "pricing" },
  { href: routes.docs, labelKey: "docs" },
  { href: routes.mcp, labelKey: "mcp" },
];

// `hasSession` is read from the httpOnly session cookie by the (server)
// marketing layout and passed down, so the client menu can render the right
// first paint without a flash of the guest buttons for returning users.
export async function Nav({ hasSession = false }: { hasSession?: boolean }) {
  const t = await getTranslations("nav.marketing");
  const navLinks: NavLink[] = NAV_ITEMS.map((item) => ({ href: item.href, label: t(item.labelKey) }));

  const userMenuLabels: MarketingUserMenuLabels = {
    signIn: t("signIn"),
    startFree: t("startFree"),
    dashboard: t("dashboard"),
    settings: t("settings"),
    signOut: t("signOut"),
    signedInAs: t("signedInAs"),
  };

  return (
    <header className="tp-chrome border-b border-hairline sticky top-0 z-40">
      <div className="container-content flex items-center justify-between h-16">
        <Link href={routes.home} className="font-display text-xl rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
          {siteConfig.brand.name}
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-body">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink transition-colors rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <MarketingUserMenu initialHasSession={hasSession} labels={userMenuLabels} />
        </div>
        <MobileNav
          links={navLinks}
          initialHasSession={hasSession}
          signInLabel={t("signIn")}
          startFreeLabel={t("startFree")}
          dashboardLabel={t("dashboard")}
          signOutLabel={t("signOut")}
          openMenuLabel={t("openMenu")}
          closeMenuLabel={t("closeMenu")}
        />
      </div>
    </header>
  );
}

export async function Footer() {
  const t = await getTranslations("nav.marketing");
  const tf = await getTranslations("nav.marketing.footer");
  return (
    <footer className="border-t border-hairline bg-paper py-16">
      <div className="container-content grid gap-10 md:grid-cols-4 text-sm text-muted">
        <div>
          <p className="font-display text-lg text-ink">{siteConfig.brand.name}</p>
          <p className="mt-2 max-w-xs">{t("tagline")}</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="overline">{tf("product")}</span>
          <Link href={routes.product.voice} className="hover:text-ink transition-colors rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">{t("voice")}</Link>
          <Link href={routes.product.agent} className="hover:text-ink transition-colors rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">{t("agent")}</Link>
          <Link href={routes.mcp} className="hover:text-ink transition-colors rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">{t("mcp")}</Link>
          <Link href={routes.pricing} className="hover:text-ink transition-colors rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">{t("pricing")}</Link>
          <Link href={routes.demo} className="hover:text-ink transition-colors rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">{tf("liveDemo")}</Link>
        </div>
        <div className="flex flex-col gap-2">
          <span className="overline">{tf("company")}</span>
          <Link href={routes.customers} className="hover:text-ink transition-colors rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">{tf("customers")}</Link>
          <Link href={routes.changelog} className="hover:text-ink transition-colors rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">{tf("changelog")}</Link>
          <Link href={routes.careers} className="hover:text-ink transition-colors rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">{tf("careers")}</Link>
          <Link href={routes.docs} className="hover:text-ink transition-colors rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">{t("docs")}</Link>
        </div>
        <div className="flex flex-col gap-2">
          <span className="overline">{tf("legal")}</span>
          <Link href={routes.security} className="hover:text-ink transition-colors rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">{tf("security")}</Link>
          <Link href={routes.privacy} className="hover:text-ink transition-colors rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">{tf("privacy")}</Link>
          <Link href={routes.terms} className="hover:text-ink transition-colors rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper">{tf("terms")}</Link>
        </div>
      </div>
      <div className="container-content mt-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-muted">
        <p>{tf("copyright", { year: new Date().getFullYear() })}</p>
        <p>{tf("madeInTheOpen")}</p>
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
        <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] tracking-display">{title}</h1>
        {lede && <p className="mt-6 text-body text-lg leading-relaxed max-w-2xl">{lede}</p>}
      </div>
    </section>
  );
}
