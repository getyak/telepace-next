"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routes, siteConfig } from "@telepace/config";

import { UserMenu } from "../user/UserMenu";
import { isNavItemActive, primaryNavItems, workspaceNavItems, type NavItem } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[240px] shrink-0 border-r border-hairline bg-paper-elevated hidden md:flex flex-col">
      <div className="px-5 py-5 border-b border-hairline">
        <Link href={routes.app.root} className="font-display text-xl">
          {siteConfig.brand.name}
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
        {primaryNavItems.map((item) => (
          <SideLink key={item.href} item={item} active={isNavItemActive(item, pathname)} />
        ))}
        <p className="overline mt-6 mb-2 px-3">Workspace</p>
        {workspaceNavItems.map((item) => (
          <SideLink key={item.href} item={item} active={isNavItemActive(item, pathname)} />
        ))}
      </nav>
      <UserMenu />
    </aside>
  );
}

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      className={`relative flex items-center gap-2.5 rounded-btn px-3 py-2 transition-colors ${
        active ? "bg-paper text-ink font-medium" : "text-body hover:bg-paper hover:text-ink"
      }`}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-pill bg-accent" />}
      <Icon className={active ? "text-accent" : "text-muted"} />
      {item.label}
    </Link>
  );
}
