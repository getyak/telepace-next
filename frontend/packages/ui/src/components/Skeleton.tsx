import * as React from "react";
import { cn } from "../cn";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("rounded-card bg-paper-sunken motion-safe:animate-skeleton", className)}
      {...props}
    />
  );
}
