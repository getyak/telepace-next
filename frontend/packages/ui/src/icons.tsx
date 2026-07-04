import * as React from "react";

/**
 * Minimal line-icon set, hand-drawn to match the editorial aesthetic
 * (stroke-width 1.5, no fills). Import individually instead of pulling
 * in an icon library — keeps the bundle and the visual language tight.
 */

type IconProps = React.SVGAttributes<SVGSVGElement> & { size?: number };

function base(paths: React.ReactNode) {
  const Icon = React.forwardRef<SVGSVGElement, IconProps>(
    ({ size = 18, ...props }, ref) => (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {paths}
      </svg>
    ),
  );
  return Icon;
}

export const MenuIcon = base(
  <>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </>,
);
MenuIcon.displayName = "MenuIcon";

export const CloseIcon = base(
  <>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </>,
);
CloseIcon.displayName = "CloseIcon";

export const StudiesIcon = base(
  <>
    <path d="M6 3.5h9.5L19 7v13.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
    <path d="M9 12h6M9 15.5h6M9 8.5h3" />
  </>,
);
StudiesIcon.displayName = "StudiesIcon";

export const InboxIcon = base(
  <>
    <path d="M4 12.5 6.5 5h11L20 12.5" />
    <path d="M4 12.5v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6h-4.5l-1 2.5h-5l-1-2.5H4Z" />
  </>,
);
InboxIcon.displayName = "InboxIcon";

export const AudienceIcon = base(
  <>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19c.7-3.2 3-5 5.5-5s4.8 1.8 5.5 5" />
    <circle cx="17" cy="8.5" r="2.25" />
    <path d="M15.5 14.2c2.1.4 3.6 1.9 4 4.3" />
  </>,
);
AudienceIcon.displayName = "AudienceIcon";

export const InsightsIcon = base(
  <>
    <path d="M4 20V9M10 20v-6M16 20V6M20.5 20H3.5" />
  </>,
);
InsightsIcon.displayName = "InsightsIcon";

export const IntegrationsIcon = base(
  <>
    <rect x="4" y="4" width="7" height="7" rx="1.25" />
    <rect x="13" y="13" width="7" height="7" rx="1.25" />
    <path d="M11 7.5h3a2 2 0 0 1 2 2v3" />
  </>,
);
IntegrationsIcon.displayName = "IntegrationsIcon";

export const SettingsIcon = base(
  <>
    <circle cx="12" cy="12" r="2.75" />
    <path d="M19.4 13.6a1.6 1.6 0 0 0 .32 1.76l.05.05a1.9 1.9 0 1 1-2.7 2.7l-.05-.05a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.47v.14a1.9 1.9 0 1 1-3.8 0v-.08a1.6 1.6 0 0 0-1.05-1.48 1.6 1.6 0 0 0-1.76.32l-.05.05a1.9 1.9 0 1 1-2.7-2.7l.05-.05a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.47-.97h-.14a1.9 1.9 0 1 1 0-3.8h.08a1.6 1.6 0 0 0 1.48-1.05 1.6 1.6 0 0 0-.32-1.76l-.05-.05a1.9 1.9 0 1 1 2.7-2.7l.05.05a1.6 1.6 0 0 0 1.76.32h.06a1.6 1.6 0 0 0 .97-1.47v-.14a1.9 1.9 0 1 1 3.8 0v.08a1.6 1.6 0 0 0 .97 1.47h.06a1.6 1.6 0 0 0 1.76-.32l.05-.05a1.9 1.9 0 1 1 2.7 2.7l-.05.05a1.6 1.6 0 0 0-.32 1.76v.06a1.6 1.6 0 0 0 1.47.97h.14a1.9 1.9 0 1 1 0 3.8h-.08a1.6 1.6 0 0 0-1.47.97Z" />
  </>,
);
SettingsIcon.displayName = "SettingsIcon";

export const ChevronDownIcon = base(<path d="m6 9 6 6 6-6" />);
ChevronDownIcon.displayName = "ChevronDownIcon";

export const CheckIcon = base(<path d="M5 12.5 9.5 17 19 7" />);
CheckIcon.displayName = "CheckIcon";
