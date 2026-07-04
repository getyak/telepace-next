import * as React from "react";
import { cn } from "../cn";

/**
 * Opacity-breathing placeholder, not a shimmer sweep — shimmer reads as
 * generic SaaS chrome and clashes with the editorial aesthetic.
 */
export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-btn bg-paper-sunken animate-skeleton", className)}
      style={style}
      aria-hidden="true"
      {...props}
    />
  ),
);
Skeleton.displayName = "Skeleton";
