import * as React from "react";
import { cn } from "../cn";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Loading placeholder. A slow opacity "breath" — no shimmer sweep, which
 * would clash with the editorial aesthetic (see docs/design-system.md).
 */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden
      className={cn("tp-breathe rounded-btn bg-paper-sunken", className)}
      {...props}
    />
  ),
);
Skeleton.displayName = "Skeleton";
