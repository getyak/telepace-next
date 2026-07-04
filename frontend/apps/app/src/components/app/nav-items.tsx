import { routes } from "@telepace/config";

type IconProps = { className?: string };

function StudiesIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 3.5h7.5L17 8v8.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7.5 10h5M7.5 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InboxIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 11.5 5.5 4h9L17 11.5v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M3 11.5h4.5l1 2h3l1-2H17" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function AudienceIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="7.5" cy="7" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 16c.5-2.5 2.2-4 4.5-4s4 1.5 4.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14" cy="6.5" r="1.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 12.3c1.9.3 3.2 1.6 3.6 3.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InsightsIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M4 16V9M9 16V4M14 16v-5M4 16h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IntegrationsIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SettingsIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="2.75" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 3.5v1.4M10 15.1v1.4M16.5 10h-1.4M4.9 10H3.5M14.6 5.4l-1 1M6.4 13.6l-1 1M14.6 14.6l-1-1M6.4 6.4l-1-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type NavItem = {
  href: string;
  label: string;
  Icon: (props: IconProps) => React.ReactElement;
  /** Extra path prefixes (besides `href`) that should count as active. */
  matchPrefixes?: string[];
};

export const primaryNavItems: NavItem[] = [
  { href: routes.app.root, label: "Studies", Icon: StudiesIcon, matchPrefixes: [routes.app.studies.root] },
  { href: routes.app.inbox, label: "Inbox", Icon: InboxIcon },
  { href: routes.app.audience, label: "Audience", Icon: AudienceIcon },
  { href: routes.app.insights, label: "Insights", Icon: InsightsIcon },
];

export const workspaceNavItems: NavItem[] = [
  { href: routes.app.integrations, label: "Integrations", Icon: IntegrationsIcon },
  { href: routes.app.settings, label: "Settings", Icon: SettingsIcon },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  if (item.href !== "/" && pathname.startsWith(`${item.href}/`)) return true;
  return item.matchPrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false;
}
