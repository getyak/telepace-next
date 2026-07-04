"use client";

/**
 * App navigation. Desktop: fixed left rail with active indicator + icons.
 * Mobile: top bar with the same full-screen overlay pattern the marketing
 * nav uses (deliberately no bottom tab bar — one menu idiom everywhere).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { routes, siteConfig } from "@telepace/config";
import {
  AudienceIcon,
  CloseIcon,
  InboxIcon,
  InsightsIcon,
  IntegrationsIcon,
  MenuIcon,
  SettingsIcon,
  StudiesIcon,
  type IconProps,
} from "@telepace/icons";
import { cn } from "@telepace/ui";

import { UserMenu } from "../user/UserMenu";

type Item = {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
};

const PRIMARY: Item[] = [
  { href: routes.app.studies.root, label: "Studies", icon: StudiesIcon },
  { href: routes.app.inbox, label: "Inbox", icon: InboxIcon },
  { href: routes.app.audience, label: "Audience", icon: AudienceIcon },
  { href: routes.app.insights, label: "Insights", icon: InsightsIcon },
];

const WORKSPACE: Item[] = [
  { href: routes.app.integrations, label: "Integrations", icon: IntegrationsIcon },
  { href: routes.app.settings, label: "Settings", icon: SettingsIcon },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onEsc(evt: KeyboardEvent) {
      if (evt.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-hairline bg-paper-elevated md:flex">
        <div className="border-b border-hairline px-5 py-5">
          <Link href={routes.app.root} className="font-display text-xl">
            {siteConfig.brand.name}
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4 text-sm">
          {PRIMARY.map((item) => (
            <SideLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
          <p className="overline px-3 pb-1 pt-6">Workspace</p>
          {WORKSPACE.map((item) => (
            <SideLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <UserMenu />
      </aside>

      {/* Mobile top bar */}
      <div className="flex h-14 items-center justify-between border-b border-hairline bg-paper-elevated px-4 md:hidden">
        <Link href={routes.app.root} className="font-display text-lg">
          {siteConfig.brand.name}
        </Link>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-m-2 p-2 text-ink"
        >
          {open ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
        </button>
      </div>

      {/* Mobile full-screen overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-paper md:hidden">
          <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
            <Link
              href={routes.app.root}
              className="font-display text-lg"
              onClick={() => setOpen(false)}
            >
              {siteConfig.brand.name}
            </Link>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="-m-2 p-2 text-ink"
            >
              <CloseIcon size={20} />
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-8">
            {[...PRIMARY, ...WORKSPACE].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "font-display text-3xl transition-colors hover:text-accent",
                  isActive(pathname, item.href) ? "text-accent" : "text-ink",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-hairline">
            <UserMenu />
          </div>
        </div>
      )}
    </>
  );
}

function SideLink({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-btn px-3 py-2 transition-colors",
        active
          ? "bg-paper font-medium text-ink"
          : "text-body hover:bg-paper hover:text-ink",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-pill bg-accent"
        />
      )}
      <Icon size={16} className={active ? "text-accent" : "text-muted"} />
      {item.label}
    </Link>
  );
}
