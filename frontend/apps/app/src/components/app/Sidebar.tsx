"use client";

/**
 * App navigation. Desktop: fixed left rail with active indicator + icons.
 * Mobile: top bar with the same full-screen overlay pattern the marketing
 * nav uses (deliberately no bottom tab bar — one menu idiom everywhere).
 */

import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import { routes, siteConfig } from "@telepace/config";
import {
  AudienceIcon,
  CloseIcon,
  CopilotIcon,
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
  /** Key into the "sidebar" namespace, e.g. t(labelKey). */
  labelKey: "studies" | "inbox" | "audience" | "insights" | "copilot" | "integrations" | "settings";
  icon: ComponentType<IconProps>;
};

const PRIMARY: Item[] = [
  { href: routes.app.studies.root, labelKey: "studies", icon: StudiesIcon },
  { href: routes.app.inbox, labelKey: "inbox", icon: InboxIcon },
  { href: routes.app.audience, labelKey: "audience", icon: AudienceIcon },
  { href: routes.app.insights, labelKey: "insights", icon: InsightsIcon },
  { href: routes.app.copilot, labelKey: "copilot", icon: CopilotIcon },
];

const WORKSPACE: Item[] = [
  { href: routes.app.integrations, labelKey: "integrations", icon: IntegrationsIcon },
  { href: routes.app.settings, labelKey: "settings", icon: SettingsIcon },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const t = useTranslations("nav.app.sidebar");
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
      {/* Desktop rail — a translucent material pinned to the viewport so it
          stays put while the page scrolls beneath it (Apple: floating chrome,
          not a panel that scrolls away). tp-chrome frosts to solid under
          prefers-reduced-transparency / no-backdrop-filter. */}
      <aside className="tp-chrome hidden w-[240px] shrink-0 flex-col border-r border-hairline md:sticky md:top-0 md:flex md:h-screen">
        <div className="border-b border-hairline px-5 py-5">
          <Link href={routes.app.root} className="font-display text-xl">
            {siteConfig.brand.name}
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4 text-sm">
          {PRIMARY.map((item) => (
            <SideLink key={item.href} item={item} label={t(item.labelKey)} active={isActive(pathname, item.href)} />
          ))}
          <p className="overline px-3 pb-1 pt-6">{t("workspaceLabel")}</p>
          {WORKSPACE.map((item) => (
            <SideLink key={item.href} item={item} label={t(item.labelKey)} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <UserMenu />
      </aside>

      {/* Mobile top bar — sticky translucent chrome so the page content
          scrolls *under* it (where the material actually reads). */}
      <div className="tp-chrome sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline px-4 md:hidden">
        <Link href={routes.app.root} className="font-display text-lg">
          {siteConfig.brand.name}
        </Link>
        <button
          type="button"
          aria-label={open ? t("closeMenu") : t("openMenu")}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-m-2 rounded-btn p-2 text-ink transform-gpu transition-transform duration-150 active:scale-90 active:duration-75 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
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
              aria-label={t("closeMenu")}
              onClick={() => setOpen(false)}
              className="-m-2 rounded-btn p-2 text-ink transform-gpu transition-transform duration-150 active:scale-90 active:duration-75 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
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
                {t(item.labelKey)}
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

function SideLink({ item, label, active }: { item: Item; label: string; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-btn px-3 py-2 transition-colors " +
          "active:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
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
      {label}
    </Link>
  );
}
