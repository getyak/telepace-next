"use client";

/**
 * App navigation. Desktop: fixed left rail with active indicator + icons.
 * Mobile: top bar with the same full-screen overlay pattern the marketing
 * nav uses (deliberately no bottom tab bar — one menu idiom everywhere).
 */

import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import { routes, siteConfig, storageKeys } from "@telepace/config";
import {
  AudienceIcon,
  CloseIcon,
  CopilotIcon,
  InboxIcon,
  InsightsIcon,
  IntegrationsIcon,
  MenuIcon,
  PanelLeftIcon,
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
  // Always starts expanded so server and first client render agree; the stored
  // preference is applied post-mount (same approach as the login form's
  // last-method recall). Collapsing is a layout change only — nothing is
  // unmounted — so the correction is invisible beyond a width transition.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKeys.sidebarCollapsed) === "1") {
        setCollapsed(true);
      }
    } catch {
      // Private-mode / blocked storage: the rail just stays expanded.
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(storageKeys.sidebarCollapsed, next ? "1" : "0");
      } catch {
        // Preference simply won't survive a reload; the toggle still works.
      }
      return next;
    });
  }, []);

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
      {/* Desktop rail — a solid sibling column in the side-by-side flex row.
          Nothing scrolls behind it (the <main> next to it owns the scroll),
          so a translucent/backdrop-blur material would render inert GPU work
          for no visual effect; a flat elevated surface is correct here. */}
      <aside
        className={cn(
          "bg-paper-elevated hidden shrink-0 flex-col border-r border-hairline md:sticky md:top-0 md:flex md:h-screen",
          // Width is the only animated property — the rail's own children are
          // laid out from it, so transitioning width alone keeps the collapse
          // reading as one continuous motion. Reduced-motion users get the end
          // state immediately.
          "transition-[width] duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          collapsed ? "w-[64px]" : "w-[240px]",
        )}
      >
        <div
          className={cn(
            "flex h-[69px] shrink-0 items-center border-b border-hairline",
            collapsed ? "justify-center px-2" : "justify-between px-5",
          )}
        >
          {/* The wordmark can't shrink into 64px, so collapsed shows the
              monogram — still a link home, still the brand, just at rail scale. */}
          <Link
            href={routes.app.root}
            className="tp-press-text font-display text-xl"
            aria-label={siteConfig.brand.name}
          >
            {collapsed ? siteConfig.brand.name[0] : siteConfig.brand.name}
          </Link>
          {!collapsed && (
            <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label={t("collapseSidebar")} />
          )}
        </div>

        <nav className={cn("flex-1 space-y-1 py-4 text-sm", collapsed ? "px-2" : "px-3")}>
          {PRIMARY.map((item) => (
            <SideLink
              key={item.href}
              item={item}
              label={t(item.labelKey)}
              active={isActive(pathname, item.href)}
              collapsed={collapsed}
            />
          ))}
          {/* The section heading is text-only; at rail width the hairline does
              the same grouping work without needing to be legible. */}
          {collapsed ? (
            <div aria-hidden className="mx-2 my-3 border-t border-hairline" />
          ) : (
            <p className="overline px-3 pb-1 pt-6">{t("workspaceLabel")}</p>
          )}
          {WORKSPACE.map((item) => (
            <SideLink
              key={item.href}
              item={item}
              label={t(item.labelKey)}
              active={isActive(pathname, item.href)}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {collapsed && (
          <div className="flex justify-center border-t border-hairline py-2">
            <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label={t("expandSidebar")} />
          </div>
        )}
        <UserMenu collapsed={collapsed} />
      </aside>

      {/* Mobile top bar — sticky translucent chrome so the page content
          scrolls *under* it (where the material actually reads). */}
      <div className="tp-chrome sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline px-4 md:hidden">
        <Link href={routes.app.root} className="tp-press-text font-display text-lg">
          {siteConfig.brand.name}
        </Link>
        <button
          type="button"
          aria-label={open ? t("closeMenu") : t("openMenu")}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="tp-press tp-press-icon -m-2 rounded-btn p-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
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
              className="tp-press-text font-display text-lg"
              onClick={() => setOpen(false)}
            >
              {siteConfig.brand.name}
            </Link>
            <button
              type="button"
              aria-label={t("closeMenu")}
              onClick={() => setOpen(false)}
              className="tp-press tp-press-icon -m-2 rounded-btn p-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
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
                  // Row rung + a left-anchored origin: these sit flush to the
                  // margin, so scaling from the centre would drift them off it.
                  "tp-press tp-press-row origin-left font-display text-3xl " +
                    "transition-[color,transform] hover:text-accent",
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

function CollapseToggle({
  collapsed,
  onToggle,
  label,
}: {
  collapsed: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
      className={cn(
        "tp-press tp-press-icon rounded-btn p-1.5 text-muted",
        "transition-[color,background-color,transform] hover:bg-paper hover:text-ink",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
      )}
    >
      <PanelLeftIcon size={16} />
    </button>
  );
}

function SideLink({
  item,
  label,
  active,
  collapsed,
}: {
  item: Item;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      // Collapsed, the icon is the only cue left, so the label has to reach the
      // accessibility tree and the pointer some other way: aria-label names the
      // link, title gives the hover tooltip.
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "tp-press tp-press-row relative flex items-center rounded-btn py-2 " +
          "transition-[color,background-color,transform] " +
          "active:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
        collapsed ? "justify-center px-0" : "gap-2.5 px-3",
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
      <Icon size={16} className={cn("shrink-0", active ? "text-accent" : "text-muted")} />
      {/* Removed from the tree rather than hidden, so the flex row collapses
          cleanly and screen readers don't read a stale duplicate of aria-label. */}
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
