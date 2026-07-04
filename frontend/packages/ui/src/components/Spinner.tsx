import * as React from "react";
import { cn } from "../cn";

type SpinnerProps = React.SVGAttributes<SVGSVGElement> & {
  size?: number;
};

export function Spinner({ size = 16, className, ...props }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("animate-spin text-current", className)}
      style={{ animationDuration: "800ms" }}
      role="status"
      aria-label="Loading"
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.2"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
