/**
 * telepace icon set — minimal line icons, hand-inlined SVG.
 *
 * Style contract (see docs/design-system.md):
 *   - 16px default size, stroke-width 1.5, round caps, currentColor
 *   - editorial restraint: two-line hamburger, thin geometric marks
 *   - no icon library dependency; add icons one at a time as needed
 */

import * as React from "react";

export type IconProps = React.SVGAttributes<SVGSVGElement> & {
  size?: number;
};

function base(size: number | undefined, props: IconProps) {
  const { size: _s, ...rest } = props;
  return {
    width: size ?? 16,
    height: size ?? 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
}

/** Two thin lines — editorial hamburger, not the classic three fat bars. */
export function MenuIcon({ size, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M2.5 5.5h11M2.5 10.5h11" />
    </svg>
  );
}

export function CloseIcon({ size, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/** Studies — a discussion outline: speech bubble with a listening pause. */
export function StudiesIcon({ size, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M13.5 7.5c0 2.8-2.46 5-5.5 5-.68 0-1.33-.11-1.93-.31L2.5 13l.9-2.7A4.6 4.6 0 0 1 2.5 7.5c0-2.76 2.46-5 5.5-5s5.5 2.24 5.5 5Z" />
      <path d="M5.75 7.5h.01M8 7.5h.01M10.25 7.5h.01" />
    </svg>
  );
}

export function InboxIcon({ size, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M2.5 9h3l1 1.75h3L10.5 9h3" />
      <path d="M4.06 3.5h7.88a1 1 0 0 1 .93.63l1.63 4.12V11.5a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V8.25l1.63-4.12a1 1 0 0 1 .93-.63Z" />
    </svg>
  );
}

export function AudienceIcon({ size, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M2.25 13c.4-2.1 1.95-3.25 3.75-3.25S9.35 10.9 9.75 13" />
      <path d="M10.5 3.6a2.25 2.25 0 0 1 0 3.8M12 9.9c1 .5 1.55 1.6 1.75 3.1" />
    </svg>
  );
}

export function InsightsIcon({ size, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M2.5 13.5v-4M6.17 13.5v-7M9.83 13.5V4M13.5 13.5V7.25" />
    </svg>
  );
}

export function IntegrationsIcon({ size, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M6 2.5v3M10 2.5v3" />
      <path d="M4 5.5h8v2.75a4 4 0 0 1-3.25 3.93v1.32h-1.5v-1.32A4 4 0 0 1 4 8.25V5.5Z" />
    </svg>
  );
}

/** Settings — sliders, quieter than a gear. */
export function SettingsIcon({ size, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M2.5 5h6.25M11.75 5h1.75M2.5 11h1.75M7.25 11h6.25" />
      <circle cx="10.25" cy="5" r="1.5" />
      <circle cx="5.75" cy="11" r="1.5" />
    </svg>
  );
}

export function ArrowRightIcon({ size, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M2.5 8h11M9.5 4l4 4-4 4" />
    </svg>
  );
}

export function ChevronDownIcon({ size, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/** A quiet five-bar waveform — the product's one recurring visual motif. */
export function WaveformIcon({ size, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M2.5 6.5v3M5.25 4.5v7M8 3v10M10.75 4.5v7M13.5 6.5v3" />
    </svg>
  );
}

/** Google "G" mark for the OAuth button. Brand colors, no stroke. */
export function GoogleIcon({ size, ...rest }: IconProps) {
  return (
    <svg
      width={size ?? 16}
      height={size ?? 16}
      viewBox="0 0 18 18"
      aria-hidden
      {...rest}
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
