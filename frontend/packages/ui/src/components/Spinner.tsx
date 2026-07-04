import * as React from "react";
import { cn } from "../cn";

type SpinnerProps = React.SVGAttributes<SVGSVGElement> & { size?: number };

export const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ className, size = 14, ...props }, ref) => (
    <svg
      ref={ref}
      className={cn("animate-spin text-current", className)}
      style={{ animationDuration: "800ms" }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  ),
);
Spinner.displayName = "Spinner";
