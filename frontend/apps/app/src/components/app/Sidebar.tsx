"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { routes, siteConfig } from "@telepace/config";
import { icons } from "@telepace/ui";

import { UserMenu } from "../user/UserMenu";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const PRIMARY_ITEMS: NavItem[] = [
  { href: routes.app.root, label: "Studies", icon: icons.StudiesIcon },
  { href: routes.app.inbox, label: "Inbox", icon: icons.InboxIcon },
  { href: routes.app.audience, label: "Audience", icon: icons.AudienceIcon },
  { href: routes.app.insights, label: "Insights", icon: icons.InsightsIcon },
];

const WORKSPACE_ITEMS: NavItem[] = [
  { href: routes.app.integrations, label: "Integrations", icon: icons.IntegrationsIcon },
  { href: routes.app.settings, label: "Settings", icon: icons.SettingsIcon },
];

function isActive(pathname: string, href: string): boolean {
  if (href === routes.app.root) return pathname === routes.app.root;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`relative flex items-center gap-2.5 rounded-btn px-3 py-2 text-sm transition-colors ${
        active ? "bg-paper text-ink font-medium" : "text-body hover:bg-paper hover:text-ink"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 -translate-y-1/2 w-[2px] rounded-pill bg-accent" />
      )}
      <Icon size={16} className={active ? "text-accent" : "text-muted"} />
      {item.label}
    </Link>
  );
}

function NavGroups({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <div className="space-y-1">
        {PRIMARY_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="mt-6">
        <p className="overline px-3 mb-2">Workspace</p>
        <div className="space-y-1">
          {WORKSPACE_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="w-[240px] shrink-0 border-r border-hairline bg-paper-elevated hidden md:flex flex-col">
        <div className="px-5 py-5 border-b border-hairline">
          <Link href={routes.app.root} className="font-display text-xl">
            {siteConfig.brand.name}
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 text-sm">
          <NavGroups />
        </nav>
        <UserMenu />
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-hairline bg-paper/90 backdrop-blur px-4 h-14">
        <Link href={routes.app.root} className="font-display text-lg">
          {siteConfig.brand.name}
        </Link>
        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center text-ink"
        >
          {mobileOpen ? <icons.CloseIcon size={22} /> : <icons.MenuIcon size={22} />}
        </button>
      </header>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-14 z-30 flex flex-col bg-paper">
          <nav className="flex-1 overflow-y-auto px-4 py-6">
            <NavGroups onNavigate={() => setMobileOpen(false)} />
          </nav>
          <UserMenu />
        </div>
      )}
    </>
  );
}
