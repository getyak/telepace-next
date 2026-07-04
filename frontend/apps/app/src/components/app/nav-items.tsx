import type * as React from "react";
import { icons } from "@telepace/ui";
import { routes } from "@telepace/config";

export type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; size?: number }>;
  /** Extra path prefixes (besides `href`) that should count as active. */
  matchPrefixes?: string[];
};

export const primaryNavItems: NavItem[] = [
  { href: routes.app.root, label: "Studies", Icon: icons.StudiesIcon, matchPrefixes: [routes.app.studies.root] },
  { href: routes.app.inbox, label: "Inbox", Icon: icons.InboxIcon },
  { href: routes.app.audience, label: "Audience", Icon: icons.AudienceIcon },
  { href: routes.app.insights, label: "Insights", Icon: icons.InsightsIcon },
];

export const workspaceNavItems: NavItem[] = [
  { href: routes.app.integrations, label: "Integrations", Icon: icons.IntegrationsIcon },
  { href: routes.app.settings, label: "Settings", Icon: icons.SettingsIcon },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  if (item.href !== "/" && pathname.startsWith(`${item.href}/`)) return true;
  return item.matchPrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false;
}
