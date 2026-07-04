import * as React from "react";
import { cn } from "../cn";

type SpinnerProps = React.SVGAttributes<SVGSVGElement> & {
  size?: number;
};

/**
 * Single-color arc spinner. Inherits `currentColor`, spins at ~800ms.
 * Respects `prefers-reduced-motion` (animation disabled in globals.css).
 */
export function Spinner({ size = 14, className, ...props }: SpinnerProps) {
  return (
    <svg
      className={cn("tp-spin shrink-0", className)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.5"
      />
      <path
        d="M14.25 8A6.25 6.25 0 0 0 8 1.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
